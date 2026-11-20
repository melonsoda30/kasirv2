import { useMutation, useQuery } from '@tanstack/react-query'
import type { QueryKey, UseMutationOptions, UseQueryOptions } from '@tanstack/react-query'
import type { AxiosError, AxiosRequestConfig } from 'axios'
import { request } from '../lib/api'

export function useApiQuery<TResponse, TSelected = TResponse>(
  queryKey: QueryKey,
  config: Omit<AxiosRequestConfig, 'method' | 'data' | 'signal'>,
  options?: Omit<UseQueryOptions<TResponse, AxiosError, TSelected>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    ...options,
    queryKey,
    queryFn: ({ signal }) => request<TResponse>({ ...config, method: 'GET', signal }),
  })
}

/** Build config from variables to support bodies, dynamic URLs, and DELETE. */
export function useApiMutation<TResponse, TVariables = void, TContext = unknown>(
  buildConfig: (variables: TVariables) => AxiosRequestConfig,
  options?: Omit<UseMutationOptions<TResponse, AxiosError, TVariables, TContext>, 'mutationFn'>,
) {
  return useMutation({
    ...options,
    mutationFn: (variables: TVariables) => request<TResponse>(buildConfig(variables)),
  })
}
