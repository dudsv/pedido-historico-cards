
-- Análise completa e detalhada de TODAS as mensagens para encontrar os 3 pedidos
DO $$
DECLARE
  existing_record RECORD;
  ai_content TEXT;
  keyword_text VARCHAR(10);
  total_text VARCHAR(20);
  total_value DECIMAL(10,2);
  address_text TEXT;
  payment_text VARCHAR(100);
  items_array JSONB := '[]'::jsonb;
  contador INTEGER := 0;
  pedidos_encontrados INTEGER := 0;
BEGIN
  -- Limpar tabela para reprocessar tudo
  DELETE FROM public.pedidos_orders;
  
  RAISE NOTICE '=== ANÁLISE COMPLETA DE TODAS AS MENSAGENS ===';
  
  -- Analisar TODAS as mensagens AI que possam conter pedidos
  FOR existing_record IN 
    SELECT * FROM public.n8n_chat_histories 
    WHERE message->>'type' = 'ai'
    ORDER BY id ASC
  LOOP
    contador := contador + 1;
    ai_content := existing_record.message->>'content';
    
    -- Verificar se contém indicadores de pedido finalizado
    IF ai_content ~* 'palavra-chave' OR 
       ai_content ~* 'pedido confirmado' OR 
       ai_content ~* 'total.*R\$' OR
       ai_content ~* 'endereço' OR
       ai_content ~* 'pagamento' OR
       ai_content ~* 'entrega' THEN
       
      RAISE NOTICE '=== MENSAGEM CANDIDATA % ===', contador;
      RAISE NOTICE 'ID: %, Session: %', existing_record.id, existing_record.session_id;
      RAISE NOTICE 'Conteúdo completo: %', ai_content;
      
      -- Resetar variáveis
      keyword_text := NULL;
      total_text := NULL;
      total_value := NULL;
      address_text := NULL;
      payment_text := NULL;
      
      -- Tentar múltiplos padrões para palavra-chave
      keyword_text := (regexp_match(ai_content, '[Pp]alavra[- ]chave[:\s]*[*]*(\d{4})', 'i'))[1];
      IF keyword_text IS NULL THEN
        keyword_text := (regexp_match(ai_content, 'keyword[:\s]*[*]*(\d{4})', 'i'))[1];
      END IF;
      IF keyword_text IS NULL THEN
        keyword_text := (regexp_match(ai_content, 'chave[:\s]*[*]*(\d{4})', 'i'))[1];
      END IF;
      IF keyword_text IS NULL THEN
        keyword_text := (regexp_match(ai_content, '(\d{4})', 'i'))[1];
      END IF;
      
      -- Tentar múltiplos padrões para total
      total_text := (regexp_match(ai_content, '[Tt]otal[^R]*R\$\s*([0-9]+(?:[.,][0-9]{1,2})?)', 'i'))[1];
      IF total_text IS NULL THEN
        total_text := (regexp_match(ai_content, 'R\$\s*([0-9]+(?:[.,][0-9]{1,2})?)', 'i'))[1];
      END IF;
      IF total_text IS NULL THEN
        total_text := (regexp_match(ai_content, 'valor.*?([0-9]+(?:[.,][0-9]{1,2})?)', 'i'))[1];
      END IF;
      
      IF total_text IS NOT NULL THEN
        total_text := replace(total_text, ',', '.');
        BEGIN
          total_value := CAST(total_text AS DECIMAL(10,2));
        EXCEPTION WHEN OTHERS THEN
          total_value := NULL;
        END;
      END IF;
      
      -- Tentar múltiplos padrões para endereço
      address_text := (regexp_match(ai_content, '[Ee]ndereço[^:]*:\s*[*]*([^\n\r*]+)', 'i'))[1];
      IF address_text IS NULL THEN
        address_text := (regexp_match(ai_content, '[Aa]ddress[^:]*:\s*[*]*([^\n\r*]+)', 'i'))[1];
      END IF;
      IF address_text IS NULL THEN
        address_text := (regexp_match(ai_content, '[Rr]ua\s+([^\n\r,]+)', 'i'))[1];
      END IF;
      IF address_text IS NOT NULL THEN
        address_text := trim(regexp_replace(address_text, '\*+', '', 'g'));
      END IF;
      
      -- Tentar múltiplos padrões para pagamento
      payment_text := (regexp_match(ai_content, '[Pp]agamento[^:]*:\s*[*]*([^\n\r*]+)', 'i'))[1];
      IF payment_text IS NULL THEN
        payment_text := (regexp_match(ai_content, '[Pp]ayment[^:]*:\s*[*]*([^\n\r*]+)', 'i'))[1];
      END IF;
      IF payment_text IS NULL THEN
        payment_text := (regexp_match(ai_content, '[Dd]inheiro|[Pp]ix|[Cc]artão', 'i'))[1];
      END IF;
      IF payment_text IS NOT NULL THEN
        payment_text := trim(regexp_replace(payment_text, '\*+', '', 'g'));
      END IF;
      
      RAISE NOTICE 'Extrações: Keyword=%, Total=%, Endereço=%, Pagamento=%', 
        keyword_text, total_value, substring(COALESCE(address_text, 'NULL'), 1, 50), 
        substring(COALESCE(payment_text, 'NULL'), 1, 30);
      
      -- Critérios mais flexíveis para inserção
      IF (keyword_text IS NOT NULL AND length(keyword_text) = 4) OR 
         (total_value > 0 AND address_text IS NOT NULL) THEN
        
        -- Gerar keyword se não existir
        IF keyword_text IS NULL OR length(keyword_text) != 4 THEN
          keyword_text := lpad((1000 + pedidos_encontrados)::text, 4, '0');
        END IF;
        
        items_array := jsonb_build_array(jsonb_build_object(
          'name', 'Pedido de Açaí',
          'price', COALESCE(total_value, 0)
        ));
        
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
            COALESCE(total_value, 0),
            COALESCE(address_text, 'Endereço não informado'),
            COALESCE(payment_text, 'Não informado')
          );
          
          pedidos_encontrados := pedidos_encontrados + 1;
          RAISE NOTICE '✅ PEDIDO % INSERIDO! Keyword=%, Total=R$%', pedidos_encontrados, keyword_text, total_value;
          
        EXCEPTION WHEN unique_violation THEN
          RAISE NOTICE '⚠️ DUPLICADO - Keyword: %', keyword_text;
        WHEN OTHERS THEN
          RAISE NOTICE '❌ ERRO AO INSERIR: %', SQLERRM;
        END;
      ELSE
        RAISE NOTICE '❌ NÃO ATENDE CRITÉRIOS - precisa keyword OU (total + endereço)';
      END IF;
      
      RAISE NOTICE ''; -- linha em branco
    END IF;
  END LOOP;
  
  -- Resultado final
  RAISE NOTICE '=== RESULTADO FINAL ===';
  RAISE NOTICE 'Total de mensagens analisadas: %', contador;
  RAISE NOTICE 'Pedidos encontrados e inseridos: %', pedidos_encontrados;
  RAISE NOTICE 'Pedidos na tabela: %', (SELECT COUNT(*) FROM public.pedidos_orders);
  
  -- Mostrar todos os pedidos inseridos
  FOR existing_record IN 
    SELECT keyword, total, address, payment_method, created_at FROM public.pedidos_orders ORDER BY created_at
  LOOP
    RAISE NOTICE 'Pedido: Keyword=%, Total=R$%, Endereço=%, Pagamento=%', 
      existing_record.keyword, existing_record.total, 
      substring(existing_record.address, 1, 40), substring(existing_record.payment_method, 1, 25);
  END LOOP;
  
END $$;

-- Atualizar a função trigger para usar os mesmos critérios flexíveis
CREATE OR REPLACE FUNCTION public.process_order_from_chat()
RETURNS TRIGGER AS $$
DECLARE
  ai_content TEXT;
  keyword_text VARCHAR(10);
  total_text VARCHAR(20);
  total_value DECIMAL(10,2);
  address_text TEXT;
  payment_text VARCHAR(100);
  items_array JSONB := '[]'::jsonb;
BEGIN
  -- Verificar se é uma mensagem AI
  IF (NEW.message->>'type' = 'ai') THEN
    ai_content := NEW.message->>'content';
    
    -- Verificar se contém indicadores de pedido
    IF ai_content ~* 'palavra-chave' OR 
       ai_content ~* 'pedido confirmado' OR 
       ai_content ~* 'total.*R\$' OR
       ai_content ~* 'endereço' OR
       ai_content ~* 'pagamento' THEN
      
      -- Extrair dados com padrões flexíveis
      keyword_text := (regexp_match(ai_content, '[Pp]alavra[- ]chave[:\s]*[*]*(\d{4})', 'i'))[1];
      IF keyword_text IS NULL THEN
        keyword_text := (regexp_match(ai_content, '(\d{4})', 'i'))[1];
      END IF;
      
      total_text := (regexp_match(ai_content, '[Tt]otal[^R]*R\$\s*([0-9]+(?:[.,][0-9]{1,2})?)', 'i'))[1];
      IF total_text IS NULL THEN
        total_text := (regexp_match(ai_content, 'R\$\s*([0-9]+(?:[.,][0-9]{1,2})?)', 'i'))[1];
      END IF;
      
      IF total_text IS NOT NULL THEN
        total_text := replace(total_text, ',', '.');
        BEGIN
          total_value := CAST(total_text AS DECIMAL(10,2));
        EXCEPTION WHEN OTHERS THEN
          total_value := NULL;
        END;
      END IF;
      
      address_text := (regexp_match(ai_content, '[Ee]ndereço[^:]*:\s*[*]*([^\n\r*]+)', 'i'))[1];
      IF address_text IS NULL THEN
        address_text := (regexp_match(ai_content, '[Rr]ua\s+([^\n\r,]+)', 'i'))[1];
      END IF;
      IF address_text IS NOT NULL THEN
        address_text := trim(regexp_replace(address_text, '\*+', '', 'g'));
      END IF;
      
      payment_text := (regexp_match(ai_content, '[Pp]agamento[^:]*:\s*[*]*([^\n\r*]+)', 'i'))[1];
      IF payment_text IS NULL THEN
        payment_text := (regexp_match(ai_content, '[Dd]inheiro|[Pp]ix|[Cc]artão', 'i'))[1];
      END IF;
      IF payment_text IS NOT NULL THEN
        payment_text := trim(regexp_replace(payment_text, '\*+', '', 'g'));
      END IF;
      
      -- Inserir se temos dados suficientes
      IF (keyword_text IS NOT NULL AND length(keyword_text) = 4) OR 
         (total_value > 0 AND address_text IS NOT NULL) THEN
        
        items_array := jsonb_build_array(jsonb_build_object(
          'name', 'Pedido de Açaí',
          'price', COALESCE(total_value, 0)
        ));
        
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
            COALESCE(keyword_text, '0000'),
            items_array,
            COALESCE(total_value, 0),
            COALESCE(address_text, 'Endereço não informado'),
            COALESCE(payment_text, 'Não informado')
          );
          
        EXCEPTION WHEN unique_violation THEN
          NULL; -- Ignora duplicatas
        WHEN OTHERS THEN
          NULL; -- Ignora outros erros
        END;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
