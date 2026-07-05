import { apiClient } from '$lib/api/runtime';
import * as sdk from '$lib/api/generated/sdk.gen';
import { callSdk } from './http';
import { mapMediaAsset } from './mappers';
import type { MediaUploadResponse } from '$lib/shared/types/api';

export const media = {
  list: async (params?: { organizationId?: string; type?: string; search?: string }) => {
    const organizationId = params?.organizationId;
    if (!organizationId) {
      throw new Error('organizationId is required to list media');
    }

    const assets = await callSdk(() =>
      sdk.listMedia<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        query: {
          organization_id: organizationId,
        },
      })
    );

    const filteredAssets = assets.filter((asset) => {
      const matchesType = params?.type
        ? String(asset.content_type ?? '').startsWith(`${params.type}/`)
        : true;
      const matchesSearch = params?.search
        ? String(asset.filename ?? '')
            .toLowerCase()
            .includes(params.search.toLowerCase())
        : true;
      return matchesType && matchesSearch;
    });

    return filteredAssets.map(mapMediaAsset);
  },
  upload: async (
    file: File,
    options: {
      organizationId: string;
      accessLevel?: string;
      collectionId?: string;
    }
  ): Promise<MediaUploadResponse> => {
    const raw = await callSdk(() =>
      sdk.uploadMedia<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        body: {
          organization_id: options.organizationId,
          file,
        },
      })
    );

    return {
      asset: mapMediaAsset(raw),
      url: raw.url,
    };
  },
  getUrl: async (id: string) => {
    const raw = await callSdk(() =>
      sdk.getMedia<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        path: { id },
      })
    );
    return { url: raw.url };
  },
  delete: (id: string) =>
    callSdk(() =>
      sdk.deleteMedia<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        path: { id },
      })
    ).then(() => undefined),
};
