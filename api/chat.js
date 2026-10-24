
    let completion;
    let requestKnowledge = '';
    let requestMessages = messages;

    // نگه‌داشتن نسخهٔ متنی پیام‌ها قبل از اضافه شدن پیوست
    const plainMessages = messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    // تلاش‌های عادی، سپس تلاش بدون دانش و در نهایت درخواست فشرده
    const requestPlans = [
      ...BUDGETS.map(b => ({
        knowledge: b.knowledge,
        maxTokens: b.maxTokens,
        compact: false,
        stripAttachment: false
      })),
      {
        knowledge: 0,
        maxTokens: 300,
        compact: false,
        stripAttachment: false
      },
      {
        knowledge: 0,
        maxTokens: 200,
        compact: true,
        stripAttachment: true
      }
    ];

    try {
      for (let b = 0; b < requestPlans.length; b++) {
        const plan = requestPlans[b];
        requestKnowledge = '';

        if (plan.knowledge > 0) {
          const r = await retrieveKnowledge(question, plan.knowledge);
          requestKnowledge = r.text || '';
          topScore = r.topScore || 0;
          knowledgeSources = r.sources || [];
          verifiedSourceCount = r.verifiedCount || 0;
        } else {
          topScore = 0;
          knowledgeSources = [];
          verifiedSourceCount = 0;
        }

        knowledge = requestKnowledge;

        // در آخرین تلاش، پیوست حذف می‌شود و فقط متن سؤال باقی می‌ماند
        requestMessages = plan.stripAttachment
          ? plainMessages.map(m => ({
              role: m.role,
              content: m.role === 'user' && m === plainMessages[plainMessages.length - 1]
                ? question.slice(0, 2000)
                : m.content.slice(0, 1000)
            }))
          : messages;

        // در تلاش نهایی از دستورهای کوتاه‌تر استفاده می‌کنیم
        const systemPrompt = plan.compact
          ? 'به فارسی پاسخ بده. دقیق، مفید و کوتاه باش. اگر اطلاعات کافی نداری، صادقانه بگو. اطلاعات تأییدنشده را قطعی بیان نکن.'
          : RULES;

        const systemMessages = [
          { role: 'system', content: systemPrompt }
        ];

        if (requestKnowledge) {
          systemMessages.push({
            role: 'system',
            content: 'اطلاعات مرجع:\n' + requestKnowledge
          });
        }

        if (!plan.compact) {
          systemMessages.push({
            role: 'system',
            content: REMINDER
          });
        }

        try {
          // هر بدنهٔ متفاوت، کلید مستقل دارد؛ retry داخلی همان کلید را حفظ می‌کند
          const attemptIdempotencyKey = crypto.randomUUID();

          completion = await retryWithBackoff(() =>
            client.chat.completions.create(
              {
                model,
                messages: systemMessages.concat(requestMessages),
                temperature: 0.2,
                max_tokens: plan.maxTokens,
                stream: false
              },
              {
                headers: {
                  'Idempotency-Key': attemptIdempotencyKey
                }
              }
            )
          );

          break;
        } catch (e) {
          const st = e && (e.status || (e.response && e.response.status));
          const errorText = String(e && e.message || '');
          const tooBig =
            st === 413 ||
            /context|413|too large|بیش از حد بزرگ|جا نمی‌شود/i.test(errorText);

          if (tooBig && b < requestPlans.length - 1) {
            console.warn(
              `upstream 413 — retry with reduced context #${b + 1}`
            );
            continue;
          }

          throw e;
        }
      }

      if (!completion) {
        throw new Error('مدل پاسخی برنگرداند.');
      }
    } catch (apiErr) {
      const status = apiErr &&
        (apiErr.status || (apiErr.response && apiErr.response.status));
      const errorText = String(apiErr && apiErr.message || '');

      console.error('upstream error', status, errorText);

      if (status === 429 || status === 503) {
        return res.status(503).json({
          error: 'model_overloaded',
          message: 'سرویس هوش مصنوعی در این لحظه شلوغ است. لطفاً چند لحظه دیگر دوباره تلاش کنید.'
        });
      }

      if (
        status === 413 ||
        /context|413|too large|بیش از حد بزرگ|جا نمی‌شود/i.test(errorText)
      ) {
        return res.status(413).json({
          error: 'context_too_large',
          message: 'حجم درخواست حتی پس از کاهش اطلاعات زیاد است. لطفاً سؤال کوتاه‌تری ارسال کنید و اگر پیوست دارید، آن را حذف کنید.'
        });
      }

      if (att && att.kind === 'image' && (status === 400 || status === 422)) {
        return res.status(422).json({
          error: 'vision_unsupported',
          message: 'مدل فعلی تحلیل تصویر را پشتیبانی نمی‌کند. لطفاً محتوای تصویر را به‌صورت متن وارد کنید.'
        });
      }

      return res.status(502).json({
        error: 'model_error',
        message: 'خطایی در دریافت پاسخ رخ داد. لطفاً دوباره تلاش کنید.'
      });
    }
