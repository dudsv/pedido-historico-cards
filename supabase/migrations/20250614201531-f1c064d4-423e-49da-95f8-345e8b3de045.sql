
-- Recriar a função sem tentar executá-la manualmente
CREATE OR REPLACE FUNCTION public.process_confirmed_order()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  ai_content TEXT;
  palavra_chave TEXT;
  total_value TEXT;
  endereco TEXT;
  pagamento TEXT;
  itens_content TEXT;
  numeric_total DECIMAL;
BEGIN
  -- Log para debug
  RAISE NOTICE 'Trigger executado para mensagem: %', NEW.message;
  
  -- Verificar se é uma mensagem AI com pedido confirmado
  IF (NEW.message->>'type' = 'ai') THEN
    ai_content := NEW.message->>'content';
    
    RAISE NOTICE 'Conteúdo AI: %', ai_content;
    
    -- Verificar se contém "Pedido confirmado com sucesso"
    IF ai_content ~* 'Pedido confirmado com sucesso' THEN
      
      RAISE NOTICE 'Pedido confirmado detectado';
      
      -- Extrair palavra-chave (mais flexível)
      palavra_chave := (regexp_match(ai_content, 'Palavra-chave:\*?\*?\s*(\d+)', 'gi'))[1];
      
      -- Extrair total (mais flexível com formatação)
      total_value := (regexp_match(ai_content, 'Total:\*?\*?\s*R\$\s*([0-9]+(?:[.,][0-9]{1,2})?)', 'gi'))[1];
      total_value := replace(total_value, ',', '.');
      
      -- Extrair endereço
      endereco := (regexp_match(ai_content, 'Endereço:\*?\*?\s*([^\n\r]+)', 'gi'))[1];
      
      -- Extrair pagamento
      pagamento := (regexp_match(ai_content, 'Pagamento:\*?\*?\s*([^\n\r]+)', 'gi'))[1];
      
      -- Extrair itens (capturar tudo entre "Itens do Pedido:" e "Total:")
      itens_content := (regexp_match(ai_content, 'Itens do Pedido:\*?\*?\s*\n(.*?)\n\*?\*?Total:', 'gis'))[1];
      
      RAISE NOTICE 'Dados extraídos - Palavra-chave: %, Total: %, Endereço: %, Pagamento: %, Itens: %', 
        palavra_chave, total_value, endereco, pagamento, itens_content;
      
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
          toppings,
          estimated_delivery
        )
        VALUES (
          NEW.session_id,
          numeric_total,
          COALESCE(trim(endereco), 'Endereço não informado'),
          COALESCE(trim(pagamento), 'Não informado'),
          'confirmed',
          'Palavra-chave: ' || COALESCE(palavra_chave, 'N/A'),
          jsonb_build_array(jsonb_build_object(
            'description', COALESCE(itens_content, 'Itens não especificados'),
            'keyword', COALESCE(palavra_chave, 'N/A')
          )),
          '[]'::jsonb,
          NOW() + INTERVAL '30 minutes'
        );
        
        RAISE NOTICE 'Pedido inserido com sucesso - ID da sessão: %, Total: R$ %', 
          NEW.session_id, numeric_total;
        
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Erro ao processar pedido: %', SQLERRM;
      END;
    ELSE
      RAISE NOTICE 'Mensagem AI não contém confirmação de pedido';
    END IF;
  ELSE
    RAISE NOTICE 'Mensagem não é do tipo AI';
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Recriar o trigger
DROP TRIGGER IF EXISTS trigger_process_confirmed_order ON public.n8n_chat_histories;
CREATE TRIGGER trigger_process_confirmed_order
  AFTER INSERT ON public.n8n_chat_histories
  FOR EACH ROW
  EXECUTE FUNCTION public.process_confirmed_order();

-- Processar mensagens existentes através de INSERT manual para simular o trigger
DO $$
DECLARE
  existing_record RECORD;
  temp_record RECORD;
BEGIN
  -- Buscar mensagens existentes que contêm confirmação de pedido
  FOR existing_record IN 
    SELECT * FROM public.n8n_chat_histories 
    WHERE message->>'type' = 'ai'
      AND message->>'content' ~* 'Pedido confirmado com sucesso'
      AND message->>'content' ~* 'Palavra-chave'
    ORDER BY id DESC
  LOOP
    -- Verificar se já não existe um pedido para esta sessão
    IF NOT EXISTS (
      SELECT 1 FROM public.pedidos_orders 
      WHERE session_id = existing_record.session_id
    ) THEN
      RAISE NOTICE 'Processando mensagem existente para sessão: %', existing_record.session_id;
      
      -- Processar manualmente extraindo os dados
      DECLARE
        ai_content TEXT;
        palavra_chave TEXT;
        total_value TEXT;
        endereco TEXT;
        pagamento TEXT;
        itens_content TEXT;
        numeric_total DECIMAL;
      BEGIN
        ai_content := existing_record.message->>'content';
        
        -- Extrair dados da mensagem
        palavra_chave := (regexp_match(ai_content, 'Palavra-chave:\*?\*?\s*(\d+)', 'gi'))[1];
        total_value := (regexp_match(ai_content, 'Total:\*?\*?\s*R\$\s*([0-9]+(?:[.,][0-9]{1,2})?)', 'gi'))[1];
        total_value := replace(total_value, ',', '.');
        endereco := (regexp_match(ai_content, 'Endereço:\*?\*?\s*([^\n\r]+)', 'gi'))[1];
        pagamento := (regexp_match(ai_content, 'Pagamento:\*?\*?\s*([^\n\r]+)', 'gi'))[1];
        itens_content := (regexp_match(ai_content, 'Itens do Pedido:\*?\*?\s*\n(.*?)\n\*?\*?Total:', 'gis'))[1];
        
        IF total_value IS NOT NULL THEN
          numeric_total := CAST(total_value AS DECIMAL);
          
          -- Inserir pedido na tabela
          INSERT INTO public.pedidos_orders (
            session_id,
            total,
            address,
            payment_method,
            status,
            observations,
            items,
            toppings,
            estimated_delivery
          )
          VALUES (
            existing_record.session_id,
            numeric_total,
            COALESCE(trim(endereco), 'Endereço não informado'),
            COALESCE(trim(pagamento), 'Não informado'),
            'confirmed',
            'Palavra-chave: ' || COALESCE(palavra_chave, 'N/A'),
            jsonb_build_array(jsonb_build_object(
              'description', COALESCE(itens_content, 'Itens não especificados'),
              'keyword', COALESCE(palavra_chave, 'N/A')
            )),
            '[]'::jsonb,
            NOW() + INTERVAL '30 minutes'
          );
          
          RAISE NOTICE 'Pedido processado manualmente - Sessão: %, Total: R$ %', 
            existing_record.session_id, numeric_total;
        END IF;
        
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Erro ao processar pedido existente: %', SQLERRM;
      END;
    END IF;
  END LOOP;
END $$;
