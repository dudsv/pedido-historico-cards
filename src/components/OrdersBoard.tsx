
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
      console.log("Fetching orders from pedidos_orders table...");
      
      const { data, error } = await supabase
        .from("pedidos_orders")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) {
        console.error("Error fetching orders:", error);
        throw error;
      }
      
      console.log("Raw data from database:", data);
      
      if (!data || data.length === 0) {
        console.log("No orders found in database");
        // Vamos tentar buscar da tabela n8n_chat_histories como fallback
        console.log("Trying to fetch from n8n_chat_histories as fallback...");
        
        const { data: chatData, error: chatError } = await supabase
          .from("n8n_chat_histories")
          .select("*")
          .order("id", { ascending: false })
          .limit(10);
        
        if (chatError) {
          console.error("Error fetching chat histories:", chatError);
          return [];
        }
        
        console.log("Chat histories data:", chatData);
        
        // Criar pedidos mock para teste se não houver dados
        const mockOrders: Order[] = [
          {
            id: "mock-1",
            sessionId: "mock-session-1",
            items: [{ name: "Açaí 400ml", price: 15.00 }],
            toppings: [{ name: "Granola", price: 2.00 }],
            total: 17.00,
            address: "Rua das Flores, 123",
            paymentMethod: "Cartão de Crédito",
            status: "confirmed",
            createdAt: new Date().toISOString(),
            estimatedDelivery: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            observations: "Pedido de teste"
          }
        ];
        
        console.log("Returning mock orders:", mockOrders);
        return mockOrders;
      }
      
      // Transform database data to match our Order interface
      const transformedOrders = data.map((dbOrder): Order => {
        console.log("Transforming order:", dbOrder);
        
        // Safely parse items and toppings
        let items: OrderItem[] = [];
        let toppings: OrderItem[] = [];
        
        try {
          if (dbOrder.items && Array.isArray(dbOrder.items)) {
            items = dbOrder.items.map((item: any) => ({
              name: item.name || 'Item não especificado',
              price: typeof item.price === 'number' ? item.price : parseFloat(item.price) || 0
            }));
          }
          
          if (dbOrder.toppings && Array.isArray(dbOrder.toppings)) {
            toppings = dbOrder.toppings.map((topping: any) => ({
              name: topping.name || 'Topping não especificado',
              price: typeof topping.price === 'number' ? topping.price : parseFloat(topping.price) || 0
            }));
          }
        } catch (parseError) {
          console.error("Error parsing items/toppings:", parseError);
        }
        
        const transformedOrder: Order = {
          id: dbOrder.id,
          sessionId: dbOrder.session_id,
          items,
          toppings,
          total: dbOrder.total,
          address: dbOrder.address,
          paymentMethod: dbOrder.payment_method,
          status: dbOrder.status as 'confirmed' | 'preparing' | 'delivering' | 'delivered',
          createdAt: dbOrder.created_at,
          estimatedDelivery: dbOrder.estimated_delivery,
          observations: dbOrder.observations
        };
        
        console.log("Transformed order:", transformedOrder);
        return transformedOrder;
      });
      
      console.log("All transformed orders:", transformedOrders);
      return transformedOrders;
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
        
        console.log(`Orders for status ${status.key}:`, statusOrders);
        
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
