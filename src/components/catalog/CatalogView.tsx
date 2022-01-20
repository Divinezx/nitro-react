import { FrontPageItem, GetCatalogIndexComposer, GetCatalogPageComposer, GetClubGiftInfo, GetGiftWrappingConfigurationComposer, GetMarketplaceConfigurationMessageComposer, ILinkEventTracker, RoomPreviewer } from '@nitrots/nitro-renderer';
import { FC, useCallback, useEffect, useReducer, useState } from 'react';
import { AddEventLinkTracker, GetRoomEngine, LocalizeText, RemoveLinkEventTracker } from '../../api';
import { CREDITS, PlaySound } from '../../api/utils/PlaySound';
import { Column } from '../../common/Column';
import { Grid } from '../../common/Grid';
import { CatalogEvent } from '../../events';
import { BatchUpdates } from '../../hooks';
import { useUiEvent } from '../../hooks/events/ui/ui-event';
import { SendMessageHook } from '../../hooks/messages/message-event';
import { NitroCardContentView, NitroCardHeaderView, NitroCardTabsItemView, NitroCardTabsView, NitroCardView } from '../../layout';
import { CatalogMessageHandler } from './CatalogMessageHandler';
import { CatalogPage } from './common/CatalogPage';
import { CatalogType } from './common/CatalogType';
import { ICatalogNode } from './common/ICatalogNode';
import { ICatalogPage } from './common/ICatalogPage';
import { IPageLocalization } from './common/IPageLocalization';
import { IPurchasableOffer } from './common/IPurchasableOffer';
import { RequestedPage } from './common/RequestedPage';
import { SearchResult } from './common/SearchResult';
import { CatalogContextProvider } from './context/CatalogContext';
import { CatalogReducer, initialCatalog } from './reducers/CatalogReducer';
import { CatalogGiftView } from './views/gift/CatalogGiftView';
import { CatalogNavigationView } from './views/navigation/CatalogNavigationView';
import { CatalogPageView } from './views/page/CatalogPageView';
import { MarketplacePostOfferView } from './views/page/layout/marketplace/MarketplacePostOfferView';

const DUMMY_PAGE_ID_FOR_OFFER_SEARCH: number = -12345678;
const REQUESTED_PAGE = new RequestedPage();

export const CatalogView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);

    const [ isBusy, setIsBusy ] = useState(false);
    const [ forceRefresh, setForceRefresh ] = useState(false);
    const [ pageId, setPageId ] = useState(-1);
    const [ previousPageId, setPreviousPageId ] = useState(-1);
    const [ currentType, setCurrentType ] = useState(CatalogType.NORMAL);
    const [ rootNode, setRootNode ] = useState<ICatalogNode>(null);
    const [ offersToNodes, setOffersToNodes ] = useState<Map<number, ICatalogNode[]>>(null);
    const [ currentPage, setCurrentPage ] = useState<ICatalogPage>(null);
    const [ currentOffer, setCurrentOffer ] = useState<IPurchasableOffer>(null);
    const [ purchasableOffer, setPurchasableOffer ] = useState<IPurchasableOffer>(null);
    const [ currentTab, setCurrentTab ] = useState<ICatalogNode>(null);
    const [ activeNodes, setActiveNodes ] = useState<ICatalogNode[]>([]);
    const [ searchResult, setSearchResult ] = useState<SearchResult>(null);
    const [ frontPageItems, setFrontPageItems ] = useState<FrontPageItem[]>([]);
    const [ roomPreviewer, setRoomPreviewer ] = useState<RoomPreviewer>(null);
    const [ catalogState, dispatchCatalogState ] = useReducer(CatalogReducer, initialCatalog);

    const resetState = useCallback(() =>
    {
        BatchUpdates(() =>
        {
            setPageId(-1);
            setPreviousPageId(-1);
            setRootNode(null);
            setOffersToNodes(null);
            setCurrentPage(null);
            setCurrentOffer(null);
            setPurchasableOffer(null);
            setCurrentTab(null);
            setActiveNodes([]);
            setSearchResult(null);
            setFrontPageItems([]);
            setIsVisible(true);
        });
    }, []);

    const getNodesByOfferId = useCallback((offerId: number, flag: boolean = false) =>
    {
        if(!offersToNodes || !offersToNodes.size) return null;

        if(flag)
        {
            const nodes: ICatalogNode[] = [];
            const offers = offersToNodes.get(offerId);

            if(offers && offers.length) for(const offer of offers) (offer.isVisible && nodes.push(offer));

            if(nodes.length) return nodes;
        }

        return offersToNodes.get(offerId);
    }, [ offersToNodes ]);

    const loadCatalogPage = useCallback((pageId: number, offerId: number) =>
    {
        if(pageId < 0) return;
        
        BatchUpdates(() =>
        {
            setIsBusy(true);
            setPageId(pageId);
        });

        if(pageId > -1) SendMessageHook(new GetCatalogPageComposer(pageId, offerId, currentType));
    }, [ currentType ]);

    const selectOffer = useCallback((offerId: number) =>
    {
        if(!currentPage || !currentPage.offers || offerId < 0) return;

        for(const offer of currentPage.offers)
        {
            if(offer.offerId !== offerId) continue;
            
            setCurrentOffer(offer)

            return;
        }
    }, [ currentPage ]);

    const showCatalogPage = useCallback((pageId: number, layoutCode: string, localization: IPageLocalization, offers: IPurchasableOffer[], offerId: number, acceptSeasonCurrencyAsCredits: boolean) =>
    {
        if(currentPage)
        {
            if(!forceRefresh && (currentPage.pageId === pageId))
            {
                if(offerId > -1) selectOffer(offerId);

                return;
            }
        }

        const catalogPage = (new CatalogPage(pageId, layoutCode, localization, offers, acceptSeasonCurrencyAsCredits) as ICatalogPage);

        BatchUpdates(() =>
        {
            setCurrentPage(catalogPage);
            setPreviousPageId(prevValue => ((pageId > DUMMY_PAGE_ID_FOR_OFFER_SEARCH) ? pageId : prevValue));
            setForceRefresh(false);

            selectOffer(offerId);
        });
    }, [ currentPage, forceRefresh, selectOffer ]);

    const activateNode = useCallback((targetNode: ICatalogNode, offerId: number = -1) =>
    {
        if(targetNode.parent.pageName === 'root')
        {
            if(targetNode.children.length)
            {
                for(const child of targetNode.children)
                {
                    if(!child.isVisible) continue;

                    targetNode = child;

                    break;
                }
            }
        }

        const nodes: ICatalogNode[] = [];

        let node = targetNode;

        while(node && node.pageName !== 'root')
        {
            nodes.push(node);

            node = node.parent;
        }

        nodes.reverse();

        setActiveNodes(prevValue =>
            {
                const isActive = (prevValue.indexOf(targetNode) >= 0);
                const isOpen = targetNode.isOpen;

                for(const existing of prevValue)
                {
                    existing.deactivate();

                    if(nodes.indexOf(existing) === -1) existing.close();
                }

                for(const n of nodes)
                {
                    n.activate();

                    if(n === targetNode.parent) n.open();
                }

                if(isActive && isOpen) targetNode.close();
                else targetNode.open();

                return nodes;
            });
            
        if(targetNode.pageId > -1) loadCatalogPage(targetNode.pageId, offerId);
    }, [ setActiveNodes, loadCatalogPage ]);

    const openPageByOfferId = useCallback((offerId: number) =>
    {
        BatchUpdates(() =>
        {
            setSearchResult(null);

            if(!isVisible)
            {
                REQUESTED_PAGE.requestedByOfferId = offerId;

                setIsVisible(true);
            }
            else
            {
                const nodes = getNodesByOfferId(offerId);

                if(!nodes || !nodes.length) return;

                activateNode(nodes[0], offerId);
            }
        });
    }, [ isVisible, getNodesByOfferId, activateNode ]);

    const onCatalogEvent = useCallback((event: CatalogEvent) =>
    {
        switch(event.type)
        {
            case CatalogEvent.PURCHASE_SUCCESS:
                PlaySound(CREDITS);
                return;
        }
    }, []);

    useUiEvent(CatalogEvent.PURCHASE_SUCCESS, onCatalogEvent);

    const linkReceived = useCallback((url: string) =>
    {
        const parts = url.split('/');

        if(parts.length < 2) return;

        switch(parts[1])
        {
            case 'show':
                setIsVisible(true);
                return;
            case 'hide':
                setIsVisible(false);
                return;
            case 'toggle':
                setIsVisible(prevValue => !prevValue);
                return;
            case 'open':
                if(parts.length > 2)
                {
                    if(parts.length === 4)
                    {
                        switch(parts[2])
                        {
                            case 'offerId':
                                openPageByOfferId(parseInt(parts[3]));
                                return;
                        }
                    }
                }
                else
                {
                    setIsVisible(true);
                }

                return;
        }
    }, [ openPageByOfferId ]);

    useEffect(() =>
    {
        const linkTracker: ILinkEventTracker = {
            linkReceived,
            eventUrlPrefix: 'catalog/'
        };

        AddEventLinkTracker(linkTracker);

        return () => RemoveLinkEventTracker(linkTracker);
    }, [ linkReceived ]);

    useEffect(() =>
    {
        setRoomPreviewer(new RoomPreviewer(GetRoomEngine(), ++RoomPreviewer.PREVIEW_COUNTER));

        return () =>
        {
            setRoomPreviewer(prevValue =>
                {
                    prevValue.dispose();

                    return null;
                });
        }
    }, []);

    useEffect(() =>
    {
        if(!isVisible || rootNode) return;

        SendMessageHook(new GetMarketplaceConfigurationMessageComposer());
        SendMessageHook(new GetGiftWrappingConfigurationComposer());
        SendMessageHook(new GetClubGiftInfo());
        SendMessageHook(new GetCatalogIndexComposer(currentType));
    }, [ isVisible, rootNode, currentType ]);

    useEffect(() =>
    {
        if(!isVisible || !rootNode) return;

        switch(REQUESTED_PAGE.requestType)
        {
            case RequestedPage.REQUEST_TYPE_NONE:
                if(activeNodes && activeNodes.length) return;

                if(rootNode.isBranch)
                {
                    for(const child of rootNode.children)
                    {
                        if(child && child.isVisible)
                        {
                            activateNode(child);

                            return;
                        }
                    }
                }
                return;
            case RequestedPage.REQUEST_TYPE_ID:
                REQUESTED_PAGE.resetRequest();
                return;
            case RequestedPage.REQUEST_TYPE_OFFER:
                openPageByOfferId(REQUESTED_PAGE.requestedByOfferId);
                REQUESTED_PAGE.resetRequest();
                return;
            case RequestedPage.REQUEST_TYPE_NAME:
                REQUESTED_PAGE.resetRequest();
                return;
        }
    }, [ isVisible, rootNode, activeNodes, activateNode, openPageByOfferId ]);

    useEffect(() =>
    {
        if(!currentPage) return;

        setCurrentOffer(null);
    }, [ currentPage ]);

    return (
        <CatalogContextProvider value={ { isVisible, isBusy, setIsBusy, pageId, currentType, setCurrentType, rootNode, setRootNode, currentOffers: offersToNodes, setCurrentOffers: setOffersToNodes, currentPage, setCurrentPage, currentOffer, setCurrentOffer, purchasableOffer, setPurchasableOffer, activeNodes, setActiveNodes, searchResult, setSearchResult, frontPageItems, setFrontPageItems, roomPreviewer, resetState, loadCatalogPage, showCatalogPage, activateNode, catalogState, dispatchCatalogState } }>
            <CatalogMessageHandler />
            { isVisible &&
                <NitroCardView uniqueKey="catalog" className="nitro-catalog">
                    <NitroCardHeaderView headerText={ LocalizeText('catalog.title') } onCloseClick={ event => { setIsVisible(false); } } />
                    <NitroCardTabsView>
                        { rootNode && (rootNode.children.length > 0) && rootNode.children.map(child =>
                            {
                                if(!child.isVisible) return null;

                                return (
                                    <NitroCardTabsItemView key={ child.pageId } isActive={ child.isActive } onClick={ event =>
                                        {
                                            if(searchResult) setSearchResult(null);

                                            activateNode(child);
                                        } }>
                                        { child.localization }
                                    </NitroCardTabsItemView>
                                );
                            }) }
                    </NitroCardTabsView>
                    <NitroCardContentView>
                        <Grid>
                            <Column size={ 3 } overflow="hidden">
                                { activeNodes && (activeNodes.length > 0) &&
                                    <CatalogNavigationView node={ activeNodes[0] } /> }
                            </Column>
                            <Column size={ 9 } overflow="hidden">
                                <CatalogPageView page={ currentPage } roomPreviewer={ roomPreviewer } />
                            </Column>
                        </Grid>
                    </NitroCardContentView>
                </NitroCardView> }
                <CatalogGiftView />
                <MarketplacePostOfferView />
        </CatalogContextProvider>
    );
}
