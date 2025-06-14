
import { useMemo } from 'react';
import { Order } from '@/types/order';

export const useOrderFilters = (orders: Order[], searchTerm: string) => {
  return useMemo(() => {
    if (!orders) return [];
    
    return orders.filter(order => {
      if (!searchTerm) return true;
      const keyword = order.observations?.toLowerCase() || "";
      const address = order.address?.toLowerCase() || "";
      const search = searchTerm.toLowerCase();
      return keyword.includes(search) || address.includes(search);
    });
  }, [orders, searchTerm]);
};
