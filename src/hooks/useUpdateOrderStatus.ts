
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useUpdateOrderStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, newStatus }: { orderId: string; newStatus: 'confirmed' | 'preparing' | 'delivering' | 'delivered' }) => {
      console.log(`Atualizando status do pedido ${orderId} para ${newStatus}`);
      
      const { data, error } = await supabase
        .from('pedidos_orders')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId)
        .select();

      if (error) {
        console.error('Erro ao atualizar status:', error);
        throw error;
      }

      console.log('Status atualizado com sucesso:', data);
      return data;
    },
    onSuccess: () => {
      // Invalida e recarrega a lista de pedidos
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (error) => {
      console.error('Erro na mutação:', error);
    }
  });
};
