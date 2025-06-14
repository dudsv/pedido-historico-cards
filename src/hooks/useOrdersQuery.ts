
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Order, OrderItem } from "@/types/order";

export const useOrdersQuery = () => {
  return useQuery({
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
};
