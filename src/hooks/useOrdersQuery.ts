
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Order, OrderItem } from "@/types/order";

export const useOrdersQuery = () => {
  return useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      console.log("=== BUSCANDO PEDIDOS DA VIEW vw_gnomus_pedidos ===");
      
      const { data: pedidosData, error: pedidosError } = await supabase
        .from("vw_gnomus_pedidos")
        .select("*")
        .order("criado_em", { ascending: false });
      
      console.log("Dados da view vw_gnomus_pedidos:", { pedidosData, pedidosError });
      
      if (pedidosError) {
        console.error("Erro ao buscar pedidos:", pedidosError);
        throw pedidosError;
      }
      
      if (!pedidosData || pedidosData.length === 0) {
        console.log("Nenhum pedido encontrado na view vw_gnomus_pedidos");
        return [];
      }
      
      const transformedOrders = pedidosData.map((dbOrder): Order => {
        console.log("Transformando pedido:", dbOrder);
        
        let items: OrderItem[] = [];
        let toppings: OrderItem[] = [];

        if (dbOrder.produto_principal) {
            items.push({
                name: `${dbOrder.produto_principal}${dbOrder.combinacao ? ` (${dbOrder.combinacao})` : ''}`,
                price: Number(dbOrder.preco_principal) || 0
            });
        }
        
        if (dbOrder.toppings) {
            toppings = dbOrder.toppings.split(',').map((topping: string) => ({
                name: topping.trim(),
                price: 0
            }));
        }

        if (dbOrder.magic_boat) {
            items.push({
                name: `Magic Boat: ${dbOrder.magic_boat}`,
                price: 0
            });
        }

        // Fallback
        if (items.length === 0) {
            items = [{
              name: 'Pedido',
              price: Number(dbOrder.valor_total) || 0
            }];
        }
        
        const statusMap: { [key: string]: 'confirmed' | 'preparing' | 'delivering' | 'delivered' } = {
          'confirmado': 'confirmed',
          'preparando': 'preparing',
          'entregando': 'delivering',
          'saiu para entrega': 'delivering',
          'entregue': 'delivered',
        };

        const statusKey = dbOrder.status_pedido?.toLowerCase() || 'confirmado';
        const mappedStatus = statusMap[statusKey] || 'confirmed';

        const transformedOrder: Order = {
          id: dbOrder.id!,
          sessionId: dbOrder.palavra_chave || 'N/A',
          items,
          toppings,
          total: Number(dbOrder.valor_total) || 0,
          address: dbOrder.endereco || 'Endereço não informado',
          paymentMethod: dbOrder.forma_pagamento || 'Não informado',
          status: mappedStatus,
          createdAt: dbOrder.criado_em!,
          observations: dbOrder.observacoes || `Palavra-chave: ${dbOrder.palavra_chave}`
        };
        
        console.log("Pedido transformado:", transformedOrder);
        return transformedOrder;
      });
      
      console.log("=== PEDIDOS FINAIS ===", transformedOrders);
      return transformedOrders;
    },
    refetchInterval: 5000, // Atualiza a cada 5 segundos para capturar novos pedidos
  });
};
