
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
      console.log("=== BUSCANDO PEDIDOS DA TABELA pedidos_orders ===");
      
      const { data: pedidosData, error: pedidosError } = await supabase
        .from("pedidos_orders")
        .select("*")
        .order("created_at", { ascending: false });
      
      console.log("Dados brutos da tabela pedidos_orders:", { pedidosData, pedidosError });
      
      if (pedidosError) {
        console.error("Erro ao buscar pedidos:", pedidosError);
        throw pedidosError;
      }
      
      if (!pedidosData || pedidosData.length === 0) {
        console.log("Nenhum pedido encontrado na tabela pedidos_orders");
        return [];
      }
      
      const transformedOrders = pedidosData.map((dbOrder): Order => {
        console.log("Transformando pedido:", dbOrder);
        
        // Parse items and toppings safely
        let items: OrderItem[] = [];
        let toppings: OrderItem[] = [];
        
        try {
          if (dbOrder.items) {
            items = Array.isArray(dbOrder.items) 
              ? (dbOrder.items as unknown as OrderItem[])
              : [];
          }
          
          if (dbOrder.toppings) {
            toppings = Array.isArray(dbOrder.toppings) 
              ? (dbOrder.toppings as unknown as OrderItem[])
              : [];
          }
        } catch (parseError) {
          console.error("Erro ao processar items/toppings:", parseError);
        }
        
        const transformedOrder: Order = {
          id: dbOrder.id,
          sessionId: dbOrder.session_id,
          items,
          toppings,
          total: Number(dbOrder.total),
          address: dbOrder.address,
          paymentMethod: dbOrder.payment_method,
          status: dbOrder.status as 'confirmed' | 'preparing' | 'delivering' | 'delivered',
          createdAt: dbOrder.created_at,
          estimatedDelivery: dbOrder.estimated_delivery,
          observations: dbOrder.observations
        };
        
        console.log("Pedido transformado:", transformedOrder);
        return transformedOrder;
      });
      
      console.log("=== PEDIDOS FINAIS ===", transformedOrders);
      return transformedOrders;
    },
    refetchInterval: 5000,
  });

  const filteredOrders = orders?.filter(order => {
    if (!searchTerm) return true;
    const keyword = order.observations?.toLowerCase() || "";
    const address = order.address?.toLowerCase() || "";
    const search = searchTerm.toLowerCase();
    return keyword.includes(search) || address.includes(search);
  });

  console.log("Orders finais recebidas:", orders);
  console.log("Filtered orders:", filteredOrders);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Carregando pedidos...</span>
      </div>
    );
  }

  if (error) {
    console.error("Query error:", error);
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Erro ao carregar pedidos: {error.message}</p>
        <button 
          onClick={() => refetch()} 
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Tentar novamente
        </button>
      </div>
    );
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
