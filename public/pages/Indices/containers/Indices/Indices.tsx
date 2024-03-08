/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component } from 'react';
import _ from 'lodash';
import { RouteComponentProps } from 'react-router-dom';
import queryString from 'query-string';
import {
  ArgsWithError,
  ArgsWithQuery,
  Criteria,
  Direction,
  EuiBasicTable,
  EuiHorizontalRule,
  EuiTableSelectionType,
  EuiTableSortingType,
  Pagination,
  Query,
} from '@elastic/eui';
import { MountPoint, SavedObjectsClientContract } from 'opensearch-dashboards/public';
import { ContentPanel, ContentPanelActions } from '../../../../components/ContentPanel';
import IndexControls from '../../components/IndexControls';
import IndexEmptyPrompt from '../../components/IndexEmptyPrompt';
import { DEFAULT_PAGE_SIZE_OPTIONS, DEFAULT_QUERY_PARAMS, indicesColumns } from '../../utils/constants';
import IndexService from '../../../../services/IndexService';
import CommonService from '../../../../services/CommonService';
import { DataStream, ManagedCatIndex } from '../../../../../server/models/interfaces';
import { getURLQueryParams } from '../../utils/helpers';
import { IndicesQueryParams } from '../../models/interfaces';
import { BREADCRUMBS, ROUTES } from '../../../../utils/constants';
import { getErrorMessage } from '../../../../utils/helpers';
import { CoreServicesContext } from '../../../../components/core_services';
import { SECURITY_EXCEPTION_PREFIX } from '../../../../../server/utils/constants';
import IndicesActions from '../IndicesActions';
import { destroyListener, EVENT_MAP, listenEvent } from '../../../../JobHandler';
import './index.scss';
import { DataSourceMenu } from '../../../../../../../src/plugins/data_source_management/public';

interface IndicesProps extends RouteComponentProps {
  indexService: IndexService;
  commonService: CommonService;
  savedObjects: SavedObjectsClientContract;
  setActionMenu: (menuMount: MountPoint | undefined) => void;
}

interface IndicesState {
  totalIndices: number;
  from: number;
  size: number;
  search: string;
  query: Query;
  sortField: keyof ManagedCatIndex;
  sortDirection: Direction;
  selectedItems: ManagedCatIndex[];
  indices: ManagedCatIndex[];
  loadingIndices: boolean;
  showDataStreams: boolean;
  isDataStreamColumnVisible: boolean;
  dataSourceId: string;
  dataSourceLabel: string;
}

export default class Indices extends Component<IndicesProps, IndicesState> {
  static contextType = CoreServicesContext;

  constructor(props: IndicesProps) {
    super(props);
    const {
      from,
      size,
      search,
      sortField,
      sortDirection,
      showDataStreams,
      dataSourceId = '',
      dataSourceLabel = '',
    } = getURLQueryParams(
      this.props.location,
    );
    console.log('this props location in indices ', this.props.location);
    this.state = {
      totalIndices: 0,
      from,
      size,
      search,
      query: Query.parse(search),
      sortField,
      sortDirection,
      selectedItems: [],
      indices: [],
      loadingIndices: true,
      showDataStreams,
      isDataStreamColumnVisible: showDataStreams,
      dataSourceId,
      dataSourceLabel,
    };

    this.getIndices = _.debounce(this.getIndices, 500, { leading: true });
  }

  async componentDidMount() {
    this.context.chrome.setBreadcrumbs([BREADCRUMBS.INDEX_MANAGEMENT, BREADCRUMBS.INDICES]);
    listenEvent(EVENT_MAP.REINDEX_COMPLETE, this.getIndices);
    listenEvent(EVENT_MAP.SHRINK_COMPLETE, this.getIndices);
    listenEvent(EVENT_MAP.SPLIT_COMPLETE, this.getIndices);
    listenEvent(EVENT_MAP.OPEN_COMPLETE, this.getIndices);
    await this.getIndices();
  }

  componentWillUnmount(): void {
    destroyListener(EVENT_MAP.REINDEX_COMPLETE, this.getIndices);
    destroyListener(EVENT_MAP.SHRINK_COMPLETE, this.getIndices);
    destroyListener(EVENT_MAP.SPLIT_COMPLETE, this.getIndices);
    destroyListener(EVENT_MAP.OPEN_COMPLETE, this.getIndices);
  }

  async componentDidUpdate(prevProps: IndicesProps, prevState: IndicesState) {
    const prevQuery = Indices.getQueryObjectFromState(prevState);
    const currQuery = Indices.getQueryObjectFromState(this.state);
    if (!_.isEqual(prevQuery, currQuery)) {
      await this.getIndices();
    }
  }

  static getQueryObjectFromState({
                                   from,
                                   size,
                                   search,
                                   sortField,
                                   sortDirection,
                                   showDataStreams,
                                   dataSourceId,
                                 }: IndicesState): IndicesQueryParams {
    return { from, size, search, sortField, sortDirection, showDataStreams, dataSourceId };
  }

  getIndices = async (): Promise<void> => {
    this.setState({ loadingIndices: true });
    try {
      const { indexService, history } = this.props;
      const queryObject = Indices.getQueryObjectFromState(this.state);
      const queryParamsString = queryString.stringify({ ...queryObject, dataSourceLabel: this.state.dataSourceLabel });
      history.replace({ ...this.props.location, search: queryParamsString });

      const getIndicesResponse = await indexService.getIndices({
        ...queryObject,
        terms: this.getTermClausesFromState(),
        indices: this.getFieldClausesFromState('indices'),
        dataStreams: this.getFieldClausesFromState('data_streams'),
      });

      if (getIndicesResponse.ok) {
        const { indices, totalIndices } = getIndicesResponse.response;
        const payload = {
          indices,
          totalIndices,
          selectedItems: this.state.selectedItems
            .map((item) => indices.find((remoteItem) => remoteItem.index === item.index))
            .filter((item) => item),
        } as IndicesState;
        this.setState(payload);
      } else {
        this.context.notifications.toasts.addDanger(getIndicesResponse.error);
      }
    } catch (err) {
      this.context.notifications.toasts.addDanger(getErrorMessage(err, 'There was a problem loading the indices'));
    }

    // Avoiding flicker by showing/hiding the "Data stream" column only after the results are loaded.
    const { showDataStreams } = this.state;
    this.setState({ loadingIndices: false, isDataStreamColumnVisible: showDataStreams });
  };

  getDataStreams = async (): Promise<DataStream[]> => {
    const { indexService } = this.props;
    const serverResponse = await indexService.getDataStreams();
    if (!serverResponse.ok) {
      if (serverResponse.error.startsWith(SECURITY_EXCEPTION_PREFIX)) {
        this.context.notifications.toasts.addWarning(serverResponse.error);
      }
    }
    return serverResponse.response.dataStreams;
  };

  toggleShowDataStreams = () => {
    const { showDataStreams } = this.state;
    this.setState({ showDataStreams: !showDataStreams });
  };

  getFieldClausesFromState = (clause: string): string[] => {
    const { query } = this.state;
    return _.flatten((query.ast.getFieldClauses(clause) || []).map((field) => field.value));
  };

  getTermClausesFromState = (): string[] => {
    const { query } = this.state;
    return (query.ast.getTermClauses() || []).map((term) => term.value);
  };

  onTableChange = ({ page: tablePage, sort }: Criteria<ManagedCatIndex>): void => {
    const { index: page, size } = tablePage;
    const { field: sortField, direction: sortDirection } = sort;
    this.setState({ from: page * size, size, sortField, sortDirection });
  };

  onSelectionChange = (selectedItems: ManagedCatIndex[]): void => {
    this.setState({ selectedItems });
  };

  onSearchChange = ({ query, queryText, error }: ArgsWithQuery | ArgsWithError): void => {
    if (error) {
      return;
    }

    this.setState({ from: 0, search: queryText, query });
  };

  resetFilters = (): void => {
    this.setState({ search: DEFAULT_QUERY_PARAMS.search, query: Query.parse(DEFAULT_QUERY_PARAMS.search) });
  };

  render() {
    const {
      totalIndices,
      from,
      size,
      search,
      sortField,
      sortDirection,
      indices,
      loadingIndices,
      showDataStreams,
      isDataStreamColumnVisible,
    } = this.state;

    const filterIsApplied = !!search;
    const page = Math.floor(from / size);

    const pagination: Pagination = {
      pageIndex: page,
      pageSize: size,
      pageSizeOptions: DEFAULT_PAGE_SIZE_OPTIONS,
      totalItemCount: totalIndices,
    };

    const sorting: EuiTableSortingType<ManagedCatIndex> = {
      sort: {
        direction: sortDirection,
        field: sortField,
      },
    };

    const selection: EuiTableSelectionType<ManagedCatIndex> = {
      onSelectionChange: this.onSelectionChange,
    };

    const { history } = this.props;

    return (
      <>
        <DataSourceMenu
          appName={"Index State Management"}
          setMenuMountPoint={this.props.setActionMenu}
          showDataSourceSelectable={true}
          dataSourceCallBackFunc={({id: dataSourceId, label: dataSourceLabel}) => {
            this.setState({ dataSourceId, dataSourceLabel });
          }}
          disableDataSourceSelectable={false}
          notifications={this.context.notifications}
          savedObjects={this.props.savedObjects}
          selectedOption={(() => {
            if (this.state.dataSourceId && this.state.dataSourceId !== '') {
              return [{
                id: this.state.dataSourceId,
                label: this.state.dataSourceLabel,
              }];
            }
            return undefined;
          })()}
          fullWidth={false}
          hideLocalCluster={false}
        />
        <ContentPanel
          actions={
            <ContentPanelActions
              actions={[
                {
                  text: 'Refresh1',
                  buttonProps: {
                    iconType: 'refresh',
                    onClick: this.getIndices,
                  },
                },
                {
                  children: (
                    <IndicesActions
                      {...this.props}
                      onDelete={this.getIndices}
                      onClose={this.getIndices}
                      onShrink={this.getIndices}
                      selectedItems={this.state.selectedItems}
                      getIndices={this.getIndices}
                      dataSourceId={this.state.dataSourceId}
                    />
                  ),
                  text: '',
                },
                {
                  text: 'Create Index',
                  buttonProps: {
                    fill: true,
                    onClick: () => {
                      this.props.history.push(`${ROUTES.CREATE_INDEX}?dataSourceId=${this.state.dataSourceId}&dataSourceLabel=${this.state.dataSourceLabel}`);
                    },
                  },
                },
              ]}
            />
          }
          bodyStyles={{ padding: 'initial' }}
          title="Indexes"
          itemCount={totalIndices}
        >
          <IndexControls
            search={search}
            onSearchChange={this.onSearchChange}
            onRefresh={this.getIndices}
            showDataStreams={showDataStreams}
            getDataStreams={this.getDataStreams}
            toggleShowDataStreams={this.toggleShowDataStreams}
          />

          <EuiHorizontalRule margin="xs" />

          <EuiBasicTable
            columns={indicesColumns(isDataStreamColumnVisible, {
              history,
              dataSourceId: this.state.dataSourceId,
              dataSourceLabel: this.state.dataSourceLabel,
            })}
            loading={this.state.loadingIndices}
            isSelectable={true}
            itemId="index"
            items={indices}
            noItemsMessage={
              <IndexEmptyPrompt filterIsApplied={filterIsApplied} loading={loadingIndices}
                                resetFilters={this.resetFilters} />
            }
            onChange={this.onTableChange}
            pagination={pagination}
            selection={selection}
            sorting={sorting}
          />
        </ContentPanel>
      </>
    );
  }
}
