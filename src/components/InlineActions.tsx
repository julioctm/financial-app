'use client';

import { useState, useTransition } from 'react';

import {
  addExternalPerson,
  removeMember,
  renameMe,
} from '@/app/actions/workspace';

function useAction() {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return { error, pending, setError, start };
}

export function RemoveMemberButton({
  workspaceId,
  userId,
  name,
}: {
  workspaceId: string;
  userId: string;
  name: string;
}) {
  const { error, pending, setError, start } = useAction();
  return (
    <span>
      <button
        disabled={pending}
        onClick={() => {
          if (
            !confirm(
              `Remover ${name} do workspace? O histórico dela é mantido.`,
            )
          )
            return;
          setError(null);
          start(async () => {
            const res = await removeMember(workspaceId, userId);
            if (!res.ok) setError(res.error);
          });
        }}
        className="text-sm text-red-600 hover:underline"
      >
        Remover
      </button>
      {error && <span className="ml-2 text-sm text-red-600">{error}</span>}
    </span>
  );
}

export function AddExternalForm({ workspaceId }: { workspaceId: string }) {
  const [name, setName] = useState('');
  const { error, pending, setError, start } = useAction();
  return (
    <div className="space-y-2">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const res = await addExternalPerson(workspaceId, name);
            if (res.ok) setName('');
            else setError(res.error);
          });
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="Nome da pessoa (sem login)"
          className="w-full rounded border p-2"
        />
        <button disabled={pending} className="btn btn-secondary">
          Adicionar
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function RenameMeForm({
  workspaceId,
  current,
}: {
  workspaceId: string;
  current: string;
}) {
  const [name, setName] = useState(current);
  const [saved, setSaved] = useState(false);
  const { error, pending, setError, start } = useAction();
  return (
    <div className="space-y-2">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setSaved(false);
          start(async () => {
            const res = await renameMe(workspaceId, name);
            if (res.ok) setSaved(true);
            else setError(res.error);
          });
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          className="w-full rounded border p-2"
        />
        <button disabled={pending} className="btn btn-secondary">
          Salvar
        </button>
      </form>
      {saved && <p className="text-sm text-green-700">Nome atualizado.</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
