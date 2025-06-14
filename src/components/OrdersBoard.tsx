import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { OrderColumn } from "@/components/OrderColumn";
import { Loader2 } from "lucide-react";
import { Order, OrderItem } from "@/types/order";

interface OrdersBoardProps {
  searchTerm: string;
}

const ORDER_STATUSES = [
  { key: "confirmed", title: "Confirmados", color: "bg-blue-100 text-blue-800" },
  { key: "preparing", title: "Preparando", color: "bg-yellow-100 text-yellow-800" },
  { key: "delivering", title: "Entregando", color: "bg-purple-100 text-purple-800" },
  { key: "delivered", title: "Entregues", color: "bg-green-100 text-green-800" },
];

export const OrdersBoard = ({ searchTerm }: OrdersBoardProps) => {
  const { data: orders, isLoading, error, refetch } = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos_orders")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      
      // Transform database data to match our Order interface
      return data.map((dbOrder): Order => ({
        id: dbOrder.id,
        sessionId: dbOrder.session_id,
        items: Array.isArray(dbOrder.items) ? (dbOrder.items as unknown) as OrderItem[] : [],
        toppings: Array.isArray(dbOrder.toppings) ? (dbOrder.toppings as unknown) as OrderItem[] : [],
        total: dbOrder.total,
        address: dbOrder.address,
        paymentMethod: dbOrder.payment_method,
        status: dbOrder.status as 'confirmed' | 'preparing' | 'delivering' | 'delivered',
        createdAt: dbOrder.created_at,
        estimatedDelivery: dbOrder.estimated_delivery,
        observations: dbOrder.observations
      }));
    },
    refetchInterval: 5000, // Atualiza a cada 5 segundos
  });

  const filteredOrders = orders?.filter(order => {
    if (!searchTerm) return true;
    const keyword = order.observations?.toLowerCase() || "";
    const address = order.address?.toLowerCase() || "";
    const search = searchTerm.toLowerCase();
    return keyword.includes(search) || address.includes(search);
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Carregando pedidos...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Erro ao carregar pedidos: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {ORDER_STATUSES.map((status) => {
        const statusOrders = filteredOrders?.filter(order => order.status === status.key) || [];
        
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
