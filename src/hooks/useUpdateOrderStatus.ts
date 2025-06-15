
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const useUpdateOrderStatus = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ orderId, newStatus }: { orderId: string; newStatus: 'confirmed' | 'preparing' | 'delivering' | 'delivered' }) => {
      const statusMap: { [key in 'confirmed' | 'preparing' | 'delivering' | 'delivered']: string } = {
        confirmed: 'Confirmado',
        preparing: 'Preparando',
        delivering: 'Entregando',
        delivered: 'Entregue',
      };
      const dbStatus = statusMap[newStatus];

      console.log(`Atualizando status do pedido ${orderId} para ${dbStatus} na tabela gnomus_pedidos`);
      
      const { data, error } = await supabase
        .from('gnomus_pedidos')
        .update({ 
          status_pedido: dbStatus,
          atualizado_em: new Date().toISOString()
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
    onSuccess: (data, variables) => {
      // Invalida e recarrega a lista de pedidos
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      
      // Mostra toast de sucesso
      const statusText = {
        confirmed: 'confirmado',
        preparing: 'preparando',
        delivering: 'saiu para entrega',
        delivered: 'entregue'
      }[variables.newStatus];
      
      toast({
        title: "Status atualizado",
        description: `Pedido marcado como ${statusText} com sucesso.`,
      });
    },
    onError: (error) => {
      console.error('Erro na mutação:', error);
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o status do pedido.",
        variant: "destructive",
      });
    }
  });
};
