
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
          if (dbOrder.items && Array.isArray(dbOrder.items)) {
            // Transform the items from the database format to the expected format
            items = dbOrder.items.map((dbItem: any) => {
              // Extract information from the description field
              const description = dbItem.description || '';
              
              // Try to extract açaí size and price from description
              const acaiMatch = description.match(/Açaí de (\d+)oz/);
              const totalMatch = description.match(/Total:\s*R\$\s*(\d+)/);
              
              let name = 'Açaí';
              let price = 0;
              
              if (acaiMatch) {
                name = `Açaí de ${acaiMatch[1]}oz`;
              }
              
              if (totalMatch) {
                price = parseFloat(totalMatch[1]);
              } else {
                // If no total found in description, use the order total
                price = Number(dbOrder.total) || 0;
              }
              
              return {
                name,
                price
              };
            });
            
            // Also extract toppings from the description
            dbOrder.items.forEach((dbItem: any) => {
              const description = dbItem.description || '';
              const toppingMatches = description.match(/- Topping:\s*([^\n]+)/g);
              
              if (toppingMatches) {
                toppingMatches.forEach(match => {
                  const toppingName = match.replace('- Topping: ', '').trim();
                  toppings.push({
                    name: toppingName,
                    price: 0 // Toppings seem to be included in the total price
                  });
                });
              }
            });
          }
          
          // If no items were extracted but we have a total, create a generic item
          if (items.length === 0 && Number(dbOrder.total) > 0) {
            items = [{
              name: 'Pedido',
              price: Number(dbOrder.total)
            }];
          }
          
          if (dbOrder.toppings && Array.isArray(dbOrder.toppings)) {
            // Only add if not already extracted from description
            const additionalToppings = (dbOrder.toppings as unknown as OrderItem[]).filter(topping => 
              topping.name && typeof topping.price === 'number'
            );
            toppings = [...toppings, ...additionalToppings];
          }
        } catch (parseError) {
          console.error("Erro ao processar items/toppings:", parseError);
          // Fallback: create a generic item with the total price
          items = [{
            name: 'Pedido',
            price: Number(dbOrder.total) || 0
          }];
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
