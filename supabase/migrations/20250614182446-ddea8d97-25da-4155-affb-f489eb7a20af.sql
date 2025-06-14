
-- Criar trigger para processar automaticamente mensagens de pedido confirmado
CREATE OR REPLACE FUNCTION process_confirmed_order()
RETURNS trigger AS $$
DECLARE
  ai_content TEXT;
  palavra_chave TEXT;
  total_value TEXT;
  endereco TEXT;
  pagamento TEXT;
  itens TEXT;
  numeric_total DECIMAL;
BEGIN
  -- Verificar se é uma mensagem AI com pedido confirmado
  IF (NEW.message->>'type' = 'ai') THEN
    ai_content := NEW.message->>'content';
    
    -- Verificar se contém "Pedido confirmado com sucesso"
    IF ai_content ~* 'Pedido confirmado com sucesso' THEN
      
      -- Extrair palavra-chave
      palavra_chave := regexp_replace(ai_content, '.*Palavra-chave:\s*(\d+).*', '\1', 'gsi');
      
      -- Extrair total (R$ valor)
      total_value := regexp_replace(ai_content, '.*Total:\s*R\$\s*([0-9]+(?:[.,][0-9]{1,2})?).*', '\1', 'gsi');
      total_value := replace(total_value, ',', '.');
      
      -- Extrair endereço
      endereco := regexp_replace(ai_content, '.*Endereço:\s*([^\n]+).*', '\1', 'gsi');
      
      -- Extrair pagamento
      pagamento := regexp_replace(ai_content, '.*Pagamento:\s*([^\n]+).*', '\1', 'gsi');
      
      -- Extrair itens do pedido (linha que começa com -)
      itens := regexp_replace(ai_content, '.*Itens do Pedido:\s*\n((?:-[^\n]+\n?)*)', '\1', 'gsi');
      
      BEGIN
        numeric_total := CAST(total_value AS DECIMAL);
        
        -- Inserir pedido na tabela pedidos_orders
        INSERT INTO public.pedidos_orders (
          session_id,
          total,
          address,
          payment_method,
          status,
          observations,
          items,
          estimated_delivery
        )
        VALUES (
          NEW.session_id,
          numeric_total,
          trim(endereco),
          trim(pagamento),
          'confirmed',
          'Palavra-chave: ' || palavra_chave,
          jsonb_build_array(jsonb_build_object('description', trim(itens), 'keyword', palavra_chave)),
          NOW() + INTERVAL '30 minutes'
        );
        
        RAISE NOTICE 'Pedido processado - Palavra-chave: %, Total: R$ %, Endereço: %', 
          palavra_chave, numeric_total, endereco;
        
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Erro ao processar pedido: %', SQLERRM;
      END;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger que executa após inserção em n8n_chat_histories
DROP TRIGGER IF EXISTS trigger_process_confirmed_order ON public.n8n_chat_histories;
CREATE TRIGGER trigger_process_confirmed_order
  AFTER INSERT ON public.n8n_chat_histories
  FOR EACH ROW
  EXECUTE FUNCTION process_confirmed_order();
