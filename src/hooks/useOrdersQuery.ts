
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
      
      console.log("Dados encontrados:", { pedidosData, pedidosError });
      
      if (pedidosError) {
        console.error("Erro ao buscar pedidos:", pedidosError);
        throw pedidosError;
      }
      
      if (!pedidosData || pedidosData.length === 0) {
        console.log("Nenhum pedido encontrado na tabela pedidos_orders");
        return [];
      }
      
      console.log(`📊 Total de ${pedidosData.length} pedidos encontrados`);
      
      const transformedOrders = pedidosData.map((dbOrder): Order => {
        console.log("Transformando pedido:", {
          id: dbOrder.id,
          keyword: dbOrder.keyword,
          total: dbOrder.total,
          session_id: dbOrder.session_id,
          address: dbOrder.address?.substring(0, 30) + '...',
          payment_method: dbOrder.payment_method
        });
        
        // Parse items safely
        let items: OrderItem[] = [];
        
        try {
          if (dbOrder.items && Array.isArray(dbOrder.items)) {
            items = dbOrder.items.map((dbItem: any) => ({
              name: dbItem.name || 'Item',
              price: Number(dbItem.price) || 0
            }));
          }
          
          // Se não há itens específicos, criar um item genérico com o total
          if (items.length === 0) {
            items = [{
              name: 'Pedido de Açaí',
              price: Number(dbOrder.total) || 0
            }];
          }
        } catch (parseError) {
          console.error("Erro ao processar items:", parseError);
          items = [{
            name: 'Pedido de Açaí',
            price: Number(dbOrder.total) || 0
          }];
        }
        
        const transformedOrder: Order = {
          id: dbOrder.id,
          sessionId: dbOrder.session_id,
          items,
          toppings: [], // Nova estrutura não tem toppings separados
          total: Number(dbOrder.total),
          address: dbOrder.address || 'Endereço não informado',
          paymentMethod: dbOrder.payment_method || 'Não informado',
          status: (dbOrder.status as 'confirmed' | 'preparing' | 'delivering' | 'delivered') || 'confirmed',
          createdAt: dbOrder.created_at,
          estimatedDelivery: dbOrder.estimated_delivery,
          observations: dbOrder.observations || (dbOrder.keyword ? `Palavra-chave: ${dbOrder.keyword}` : '')
        };
        
        console.log("✅ Pedido transformado:", {
          id: transformedOrder.id,
          keyword: dbOrder.keyword,
          total: transformedOrder.total,
          address: transformedOrder.address?.substring(0, 30) + '...',
          paymentMethod: transformedOrder.paymentMethod,
          status: transformedOrder.status
        });
        
        return transformedOrder;
      });
      
      console.log("=== PEDIDOS FINAIS PARA DASHBOARD ===");
      console.log(`🎯 Retornando ${transformedOrders.length} pedidos para o dashboard`);
      transformedOrders.forEach((order, index) => {
        console.log(`Pedido ${index + 1}: Keyword=${order.observations?.match(/\d{4}/)?.[0] || 'N/A'}, Total=R$${order.total}, Método=${order.paymentMethod}`);
      });
      
      return transformedOrders;
    },
    refetchInterval: 5000, // Atualiza a cada 5 segundos para capturar novos pedidos
  });
};
