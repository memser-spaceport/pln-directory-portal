import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DemoDaysQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { DemoDay } from '../../screens/demo-days/types/demo-day';

export interface UpdateBrandingDto {
  logoUid?: string | null;
  headerImageUid?: string | null;
  primaryColor?: string | null;
  landingLogosEnabled?: boolean;
}

interface MutationParams {
  authToken: string;
  uid: string;
  data: UpdateBrandingDto;
}

async function updateBranding(params: MutationParams): Promise<DemoDay> {
  const config = {
    headers: {
      authorization: `Bearer ${params.authToken}`,
    },
  };

  const { data } = await api.patch<DemoDay>(
    `${API_ROUTE.ADMIN_DEMO_DAYS}/${params.uid}/branding`,
    params.data,
    config
  );
  return data;
}

export function useUpdateBranding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateBranding,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [DemoDaysQueryKeys.GET_DEMO_DAYS_LIST] });
      // Invalidate all demo day detail queries
      queryClient.invalidateQueries({ queryKey: [DemoDaysQueryKeys.GET_DEMO_DAY_DETAILS] });
    },
  });
}
