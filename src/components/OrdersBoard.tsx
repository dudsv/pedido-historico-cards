
import { OrderColumn } from "@/components/OrderColumn";
import { OrdersLoading } from "@/components/OrdersLoading";
import { OrdersError } from "@/components/OrdersError";
import { useOrdersQuery } from "@/hooks/useOrdersQuery";
import { useOrderFilters } from "@/hooks/useOrderFilters";
import { ORDER_STATUSES } from "@/constants/orderStatuses";

interface OrdersBoardProps {
  searchTerm: string;
}

export const OrdersBoard = ({ searchTerm }: OrdersBoardProps) => {
  const { data: orders, isLoading, error, refetch } = useOrdersQuery();
  const filteredOrders = useOrderFilters(orders || [], searchTerm);

  console.log("Orders finais recebidas:", orders);
  console.log("Filtered orders:", filteredOrders);

  if (isLoading) {
    return <OrdersLoading />;
  }

  if (error) {
    return <OrdersError error={error} onRetry={refetch} />;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {ORDER_STATUSES.map((status) => {
        const statusOrders = filteredOrders?.filter(order => order.status === status.key) || [];
        
        console.log(`Orders para status ${status.key}:`, statusOrders);
        
        return (
          <OrderColumn
            key={status.key}
            title={status.title}
            status={status.key}
            color={status.color}
            orders={statusOrders}
            onRefresh={refetch}
          />
        );
      })}
    </div>
  );
};
