/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component } from 'react';
import { EuiSpacer, EuiTitle } from '@elastic/eui';
import { RouteComponentProps } from 'react-router-dom';
import { MountPoint } from 'opensearch-dashboards/public';
import IndexForm from '../IndexForm';
import { BREADCRUMBS, IndicesUpdateMode, ROUTES } from '../../../../utils/constants';
import { CoreServicesContext } from '../../../../components/core_services';
import { CommonService } from '../../../../services/index';
import { getURLQueryParams } from '../../../Indices/utils/helpers';
import { DataSourceMenu } from '../../../../../../../src/plugins/data_source_management/public';

interface CreateIndexProps extends RouteComponentProps<{ index?: string; mode?: IndicesUpdateMode }> {
  isEdit?: boolean;
  commonService: CommonService;
  setActionMenu: (menuMount: MountPoint | undefined) => void;
}

interface CreateIndexState {
  dataSourceId: string;
  dataSourceLabel: string;
}

export default class CreateIndex extends Component<CreateIndexProps, CreateIndexState> {
  static contextType = CoreServicesContext;

  constructor(props) {
    super(props);
    const { dataSourceId, dataSourceLabel } = getURLQueryParams(this.props.location);
    this.state = {
      dataSourceId,
      dataSourceLabel,
    };
  }

  get index() {
    return this.props.match.params.index;
  }

  get isEdit() {
    return this.props.match.params.index !== undefined;
  }

  componentDidMount = async (): Promise<void> => {
    const isEdit = this.isEdit;
    this.context.chrome.setBreadcrumbs([
      BREADCRUMBS.INDEX_MANAGEMENT,
      BREADCRUMBS.INDICES,
      isEdit ? BREADCRUMBS.EDIT_INDEX : BREADCRUMBS.CREATE_INDEX,
    ]);
  };

  onCancel = (): void => {
    this.props.history.push(ROUTES.INDICES);
  };

  render() {
    const isEdit = this.isEdit;

    console.log('data source id in createIndex is ', this.state.dataSourceId, this.state.dataSourceLabel);

    return (
      <>
        <DataSourceMenu
          appName={"Index State Management"}
          setMenuMountPoint={this.props.setActionMenu}
          showDataSourceSelectable={true}
          disableDataSourceSelectable={true}
          notifications={this.context.notifications}
          savedObjects={this.context.savedObjects.client}
          selectedOption={(() => {
            if (this.state.dataSourceId && this.state.dataSourceId !== '') {
              return [{
                id: this.state.dataSourceId,
                label: this.state.dataSourceLabel,
              }];
            }
            return undefined;
          })()}
        />
        <div style={{ padding: '0px 50px' }}>
          <EuiTitle size="l">
            <h1>{isEdit ? 'Edit' : 'Create'} index</h1>
          </EuiTitle>
          <EuiSpacer />
          <IndexForm
            index={this.index}
            mode={this.props.match.params.mode}
            onCancel={this.onCancel}
            onSubmitSuccess={() => this.props.history.push(ROUTES.INDICES)}
            dataSourceId={this.state.dataSourceId}
          />
        </div>
      </>
    );
  }
}
