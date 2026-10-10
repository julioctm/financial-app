'use client';

import { useState, useTransition } from 'react';

import { createInvite } from '@/app/actions/workspace';
import { Button } from '@/components/ui/button';
import { FormMessage, Input } from '@/components/ui/field';

export function InviteButton({ workspaceId }: { workspaceId: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  function generate() {
    setError(null);
    setCopied(false);
    start(async () => {
      const res = await createInvite(workspaceId);
      if (res.ok) setLink(res.link);
      else setError(res.error);
    });
  }

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  return (
    <div className="space-y-2">
      <button
        onClick={generate}
        disabled={pending}
        className="btn btn-secondary"
      >
        {pending ? 'Gerando…' : 'Gerar convite'}
      </button>
      {link && (
        <div className="space-y-1 text-sm">
          <div className="flex gap-2">
            <Input
              readOnly
              value={link}
              aria-label="Link do convite"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button variant="secondary" onClick={copy}>
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
          <p className="text-muted">
            Link de uso único, válido por 7 dias. Envie só para quem você quer
            convidar.
          </p>
        </div>
      )}
      {error && <FormMessage>{error}</FormMessage>}
    </div>
  );
}
