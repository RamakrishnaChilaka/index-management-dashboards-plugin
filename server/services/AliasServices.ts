/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  RequestHandlerContext,
  OpenSearchDashboardsRequest,
  OpenSearchDashboardsResponseFactory,
  IOpenSearchDashboardsResponse,
  ILegacyCustomClusterClient,
  ILegacyScopedClusterClient,
} from "opensearch-dashboards/server";
import { ServerResponse } from "../models/types";
import { Alias, GetAliasesResponse } from "../models/interfaces";
import { SECURITY_EXCEPTION_PREFIX } from "../utils/constants";

export default class AliasServices {
  osDriver: ILegacyCustomClusterClient;

  constructor(osDriver: ILegacyCustomClusterClient) {
    this.osDriver = osDriver;
  }

  getAliases = async (
    context: any,
    request: OpenSearchDashboardsRequest,
    response: OpenSearchDashboardsResponseFactory
  ): Promise<IOpenSearchDashboardsResponse<ServerResponse<GetAliasesResponse>>> => {
    try {
      const { search } = request.query as {
        search?: string;
      };

      const useQuery = !request.body;
      const usedParam = useQuery ? request.query : request.body;
      console.log("request is ", usedParam);
      const { dataSourceId = "" } = usedParam || {};
      let callWithRequest;
      console.log("dataSourceId inside commonservice ", dataSourceId);
      if (!dataSourceId || dataSourceId.trim().length == 0) {
        // empty or null or undefined string
        callWithRequest = this.osDriver.asScoped(request).callAsCurrentUser;
      } else {
        callWithRequest = context.dataSource.opensearch.legacy.getClient(dataSourceId).callAPI;
      }
      const [aliases, apiAccessible, errMsg] = await getAliases(callWithRequest, search);

      if (!apiAccessible)
        return response.custom({
          statusCode: 200,
          body: {
            ok: false,
            error: errMsg,
          },
        });

      return response.custom({
        statusCode: 200,
        body: {
          ok: true,
          response: {
            aliases: aliases,
            totalAliases: aliases.length,
          },
        },
      });
    } catch (err) {
      console.error("Index Management - AliasesService - getAliases:", err);
      return response.custom({
        statusCode: 200,
        body: {
          ok: false,
          error: err.message,
        },
      });
    }
  };
}

export async function getAliases(callWithRequest: any, search?: string): Promise<[Alias[], boolean, string]> {
  const searchPattern = search ? `*${search}*` : "*";

  let accessible = true;
  let errMsg = "";
  const aliasesResponse = await callWithRequest("cat.aliases", {
    format: "json",
    name: searchPattern,
  }).catch((e) => {
    if (e.statusCode === 403 && e.message.startsWith(SECURITY_EXCEPTION_PREFIX)) {
      accessible = false;
      errMsg = e.message;
      return { alias: [] };
    }
    throw e;
  });

  return [aliasesResponse, accessible, errMsg];
}
