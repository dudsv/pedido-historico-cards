
-- Análise específica para encontrar o pedido 7832 e identificar por que não foi capturado
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
  current_count INTEGER;
BEGIN
  -- Verificar estado atual
  SELECT COUNT(*) INTO current_count FROM public.pedidos_orders;
  RAISE NOTICE '=== PEDIDOS ATUAIS NA TABELA: % ===', current_count;
  
  RAISE NOTICE '=== BUSCA ESPECÍFICA PELO PEDIDO 7832 ===';
  RAISE NOTICE 'Procurando por: palavra-chave 7832, R$ 15, Pix, Comendador Henrique lorea 198';
  
  -- Buscar mensagens que contenham "7832"
  FOR existing_record IN 
    SELECT * FROM public.n8n_chat_histories 
    WHERE message->>'content' ~* '7832'
    ORDER BY id ASC
  LOOP
    contador := contador + 1;
    ai_content := existing_record.message->>'content';
    
    RAISE NOTICE '=== MENSAGEM % COM 7832 ===', contador;
    RAISE NOTICE 'ID: %, Session: %, Type: %', existing_record.id, existing_record.session_id, existing_record.message->>'type';
    RAISE NOTICE 'Conteúdo completo: %', ai_content;
    RAISE NOTICE '';
  END LOOP;
  
  -- Se não encontrou 7832, buscar por R$ 15 + Pix + Henrique
  IF contador = 0 THEN
    RAISE NOTICE '=== NÃO ENCONTROU 7832, BUSCANDO POR R$ 15 + PIX + HENRIQUE ===';
    
    FOR existing_record IN 
      SELECT * FROM public.n8n_chat_histories 
      WHERE message->>'type' = 'ai'
      AND message->>'content' ~* 'R\$\s*15'
      AND message->>'content' ~* 'pix'
      AND message->>'content' ~* 'henrique'
      ORDER BY id ASC
    LOOP
      contador := contador + 1;
      ai_content := existing_record.message->>'content';
      
      RAISE NOTICE '=== MENSAGEM % COM R$ 15 + PIX + HENRIQUE ===', contador;
      RAISE NOTICE 'ID: %, Session: %, Type: %', existing_record.id, existing_record.session_id, existing_record.message->>'type';
      RAISE NOTICE 'Conteúdo: %', substring(ai_content, 1, 500);
      RAISE NOTICE '';
    END LOOP;
  END IF;
  
  -- Análise das mensagens mais recentes
  RAISE NOTICE '=== ANÁLISE DAS 10 MENSAGENS AI MAIS RECENTES ===';
  
  FOR existing_record IN 
    SELECT * FROM public.n8n_chat_histories 
    WHERE message->>'type' = 'ai'
    ORDER BY id DESC
    LIMIT 10
  LOOP
    ai_content := existing_record.message->>'content';
    
    -- Verificar se contém indicadores de pedido
    IF ai_content ~* 'palavra-chave' AND ai_content ~* 'total' AND ai_content ~* 'R\$' THEN
      RAISE NOTICE '=== MENSAGEM AI RECENTE COM PEDIDO ===';
      RAISE NOTICE 'ID: %, Session: %', existing_record.id, existing_record.session_id;
      
      -- Extrair dados
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
      IF address_text IS NULL THEN
        address_text := (regexp_match(ai_content, 'Comendador\s+Henrique[^,\n\r]*', 'i'))[1];
      END IF;
      IF address_text IS NOT NULL THEN
        address_text := trim(regexp_replace(address_text, '\*+', '', 'g'));
      END IF;
      
      payment_text := (regexp_match(ai_content, '[Pp]agamento[^:]*:\s*[*]*([^\n\r*]+)', 'i'))[1];
      IF payment_text IS NULL THEN
        payment_text := (regexp_match(ai_content, '[Pp]ix|[Dd]inheiro|[Cc]artão', 'i'))[1];
      END IF;
      IF payment_text IS NOT NULL THEN
        payment_text := trim(regexp_replace(payment_text, '\*+', '', 'g'));
      END IF;
      
      RAISE NOTICE 'Extrações: Keyword=%, Total=%, Endereço=%, Pagamento=%', 
        keyword_text, total_value, 
        substring(COALESCE(address_text, 'NULL'), 1, 50), 
        substring(COALESCE(payment_text, 'NULL'), 1, 30);
      
      -- Verificar se já existe na tabela
      IF NOT EXISTS (
        SELECT 1 FROM public.pedidos_orders 
        WHERE keyword = keyword_text OR 
        (session_id = existing_record.session_id AND total = total_value)
      ) THEN
        
        -- Critérios flexíveis para inserção
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
            RAISE NOTICE '✅ PEDIDO INSERIDO! Keyword=%, Total=R$%', keyword_text, total_value;
            
          EXCEPTION WHEN unique_violation THEN
            RAISE NOTICE '⚠️ DUPLICADO - Keyword: %', keyword_text;
          WHEN OTHERS THEN
            RAISE NOTICE '❌ ERRO AO INSERIR: %', SQLERRM;
          END;
        ELSE
          RAISE NOTICE '❌ NÃO ATENDE CRITÉRIOS - precisa keyword OU (total + endereço)';
        END IF;
      ELSE
        RAISE NOTICE '⚠️ PEDIDO JÁ EXISTE NA TABELA';
      END IF;
      
      RAISE NOTICE ''; -- linha em branco
    END IF;
  END LOOP;
  
  -- Resultado final
  RAISE NOTICE '=== RESULTADO FINAL ===';
  RAISE NOTICE 'Mensagens analisadas: %', contador;
  RAISE NOTICE 'Novos pedidos inseridos: %', pedidos_encontrados;
  RAISE NOTICE 'Total de pedidos na tabela: %', (SELECT COUNT(*) FROM public.pedidos_orders);
  
  -- Mostrar todos os pedidos atuais
  FOR existing_record IN 
    SELECT keyword, total, address, payment_method, created_at FROM public.pedidos_orders ORDER BY created_at
  LOOP
    RAISE NOTICE 'Pedido: Keyword=%, Total=R$%, Endereço=%, Pagamento=%', 
      existing_record.keyword, existing_record.total, 
      substring(existing_record.address, 1, 40), 
      substring(existing_record.payment_method, 1, 25);
  END LOOP;
  
END $$;
