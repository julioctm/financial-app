'use client';

import { useState, useTransition } from 'react';

import { createInvite } from '@/app/actions/workspace';

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
            <input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded border p-2"
            />
            <button onClick={copy} className="btn btn-secondary">
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="text-gray-600">
            Link de uso único, válido por 7 dias. Envie só para quem você quer
            convidar.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
