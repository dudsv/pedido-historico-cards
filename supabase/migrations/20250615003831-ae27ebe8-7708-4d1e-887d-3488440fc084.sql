
-- Função melhorada para processar pedidos com padrões mais específicos
CREATE OR REPLACE FUNCTION public.process_order_from_chat()
RETURNS TRIGGER AS $$
DECLARE
  ai_content TEXT;
  keyword_text VARCHAR(10);
  items_text TEXT;
  total_text VARCHAR(20);
  total_value DECIMAL(10,2);
  address_text TEXT;
  payment_text VARCHAR(100);
  observations_text TEXT;
  items_array JSONB := '[]'::jsonb;
  item_line TEXT;
  item_name TEXT;
  item_price DECIMAL(10,2);
BEGIN
  -- Verificar se é uma mensagem AI com resumo final
  IF (NEW.message->>'type' = 'ai') THEN
    ai_content := NEW.message->>'content';
    
    -- Detectar padrão: palavra-chave + itens + total
    IF ai_content ~* 'Palavra-chave.*\d{4}' AND 
       ai_content ~* 'Total.*R\$' THEN
      
      -- Extrair palavra-chave (buscar 4 dígitos após "Palavra-chave")
      keyword_text := (regexp_match(ai_content, 'Palavra-chave[^0-9]*(\d{4})', 'i'))[1];
      
      -- Extrair total (buscar valor após R$)
      total_text := (regexp_match(ai_content, 'Total[^R]*R\$\s*([0-9]+(?:[.,][0-9]{1,2})?)', 'i'))[1];
      IF total_text IS NOT NULL THEN
        total_text := replace(total_text, ',', '.');
        total_value := CAST(total_text AS DECIMAL(10,2));
      END IF;
      
      -- Extrair endereço (buscar após "Endereço:")
      address_text := (regexp_match(ai_content, 'Endereço[^:]*:\s*([^\n\r]+)', 'i'))[1];
      IF address_text IS NOT NULL THEN
        address_text := trim(address_text);
      END IF;
      
      -- Extrair forma de pagamento (buscar após "Pagamento:")
      payment_text := (regexp_match(ai_content, 'Pagamento[^:]*:\s*([^\n\r]+)', 'i'))[1];
      IF payment_text IS NOT NULL THEN
        payment_text := trim(payment_text);
      END IF;
      
      -- Extrair itens - tentar diferentes padrões
      items_text := (regexp_match(ai_content, 'Itens do Pedido[^:]*:\s*\n(.*?)\n.*Total', 'gis'))[1];
      
      -- Se não encontrou, tentar padrão alternativo
      IF items_text IS NULL THEN
        items_text := (regexp_match(ai_content, 'Itens do Pedido[^:]*:\s*\n(.*?)\n.*Endereço', 'gis'))[1];
      END IF;
      
      -- Se ainda não encontrou, tentar buscar entre bullets
      IF items_text IS NULL THEN
        items_text := (regexp_match(ai_content, '- (.*?)Total:', 'gis'))[1];
      END IF;
      
      -- Processar itens
      items_array := '[]'::jsonb;
      
      IF items_text IS NOT NULL THEN
        FOR item_line IN 
          SELECT unnest(string_to_array(trim(items_text), E'\n'))
        LOOP
          IF trim(item_line) != '' AND item_line !~ '^\s*$' THEN
            -- Limpar formatação
            item_name := trim(regexp_replace(item_line, '^[\s\-\*]*', ''));
            item_name := trim(regexp_replace(item_name, '\*\*', '', 'g'));
            
            -- Remover prefixos como "Açaí de" ou "com:"
            IF item_name ~ ':' THEN
              item_name := trim(split_part(item_name, ':', 1));
            END IF;
            
            IF item_name != '' AND length(item_name) > 2 THEN
              items_array := items_array || jsonb_build_object(
                'name', item_name,
                'price', 0
              );
            END IF;
          END IF;
        END LOOP;
      END IF;
      
      -- Se não conseguiu extrair itens específicos, criar um genérico baseado no total
      IF jsonb_array_length(items_array) = 0 THEN
        items_array := jsonb_build_array(jsonb_build_object(
          'name', 'Pedido de Açaí',
          'price', COALESCE(total_value, 0)
        ));
      END IF;
      
      -- Inserir pedido se temos dados essenciais
      IF keyword_text IS NOT NULL AND total_value > 0 THEN
        BEGIN
          INSERT INTO public.pedidos_orders (
            session_id,
            keyword,
            items,
            total,
            address,
            payment_method
          ) VALUES (
            NEW.session_id,
            keyword_text,
            items_array,
            total_value,
            COALESCE(address_text, 'Endereço não informado'),
            COALESCE(payment_text, 'Não informado')
          );
          
          RAISE NOTICE 'Pedido inserido - Keyword: %, Total: R$ %, Items: %', 
            keyword_text, total_value, items_array;
            
        EXCEPTION WHEN unique_violation THEN
          RAISE NOTICE 'Pedido já existe com keyword: %', keyword_text;
        WHEN OTHERS THEN
          RAISE NOTICE 'Erro ao inserir pedido: %', SQLERRM;
        END;
      ELSE
        RAISE NOTICE 'Dados insuficientes - Keyword: %, Total: %', keyword_text, total_value;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Reprocessar mensagens existentes com debug mais detalhado
DO $$
DECLARE
  existing_record RECORD;
  ai_content TEXT;
  keyword_text VARCHAR(10);
  total_text VARCHAR(20);
  total_value DECIMAL(10,2);
  address_text TEXT;
  payment_text VARCHAR(100);
  items_text TEXT;
  items_array JSONB := '[]'::jsonb;
  item_line TEXT;
  item_name TEXT;
BEGIN
  -- Limpar tabela
  DELETE FROM public.pedidos_orders;
  
  -- Debug: mostrar quantas mensagens AI existem
  RAISE NOTICE 'Total de mensagens AI: %', (
    SELECT COUNT(*) FROM public.n8n_chat_histories 
    WHERE message->>'type' = 'ai'
  );
  
  -- Processar mensagens que contêm palavras-chave relacionadas a pedidos
  FOR existing_record IN 
    SELECT * FROM public.n8n_chat_histories 
    WHERE message->>'type' = 'ai'
      AND (
        message->>'content' ~* 'Palavra-chave.*\d{4}' OR
        message->>'content' ~* 'resumo final' OR
        message->>'content' ~* 'pedido confirmado'
      )
    ORDER BY id DESC
  LOOP
    ai_content := existing_record.message->>'content';
    
    RAISE NOTICE 'Processando mensagem ID: %, Session: %', existing_record.id, existing_record.session_id;
    
    -- Tentar extrair dados
    keyword_text := (regexp_match(ai_content, 'Palavra-chave[^0-9]*(\d{4})', 'i'))[1];
    total_text := (regexp_match(ai_content, 'Total[^R]*R\$\s*([0-9]+(?:[.,][0-9]{1,2})?)', 'i'))[1];
    
    IF total_text IS NOT NULL THEN
      total_text := replace(total_text, ',', '.');
      total_value := CAST(total_text AS DECIMAL(10,2));
    END IF;
    
    address_text := (regexp_match(ai_content, 'Endereço[^:]*:\s*([^\n\r]+)', 'i'))[1];
    IF address_text IS NOT NULL THEN
      address_text := trim(address_text);
    END IF;
    
    payment_text := (regexp_match(ai_content, 'Pagamento[^:]*:\s*([^\n\r]+)', 'i'))[1];
    IF payment_text IS NOT NULL THEN
      payment_text := trim(payment_text);
    END IF;
    
    RAISE NOTICE 'Extraído - Keyword: %, Total: %, Endereço: %, Pagamento: %', 
      keyword_text, total_value, address_text, payment_text;
    
    -- Criar itens genéricos baseados no total
    items_array := jsonb_build_array(jsonb_build_object(
      'name', 'Pedido de Açaí',
      'price', COALESCE(total_value, 0)
    ));
    
    -- Inserir se temos dados essenciais
    IF keyword_text IS NOT NULL AND total_value > 0 THEN
      BEGIN
        INSERT INTO public.pedidos_orders (
          session_id,
          keyword,
          items,
          total,
          address,
          payment_method
        ) VALUES (
          existing_record.session_id,
          keyword_text,
          items_array,
          total_value,
          COALESCE(address_text, 'Endereço não informado'),
          COALESCE(payment_text, 'Não informado')
        );
        
        RAISE NOTICE 'SUCESSO - Pedido inserido: %', keyword_text;
        
      EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'AVISO - Pedido duplicado: %', keyword_text;
      WHEN OTHERS THEN
        RAISE NOTICE 'ERRO - Falha ao inserir: %', SQLERRM;
      END;
    ELSE
      RAISE NOTICE 'PULADO - Dados insuficientes para inserir';
    END IF;
  END LOOP;
  
  -- Mostrar resultado final
  RAISE NOTICE 'Total de pedidos inseridos: %', (SELECT COUNT(*) FROM public.pedidos_orders);
  
END $$;
