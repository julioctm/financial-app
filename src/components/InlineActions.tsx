'use client';

import { useState, useTransition } from 'react';

import {
  addExternalPerson,
  removeExternalPerson,
  removeMember,
  renameMe,
} from '@/app/actions/workspace';
import { Button } from '@/components/ui/button';
import { FormMessage, Input } from '@/components/ui/field';

function useAction() {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return { error, pending, setError, start };
}

// Two-step inline confirmation (window.confirm is blocked in some browsers/webviews).
function ConfirmRemove({
  message,
  onConfirm,
  pending,
}: {
  message: string;
  onConfirm: () => void;
  pending: boolean;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button variant="danger" size="sm" onClick={() => setAsking(true)}>
        Remover
      </Button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">{message}</span>
      <Button
        variant="danger"
        size="sm"
        disabled={pending}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        Confirmar
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setAsking(false)}>
        Cancelar
      </Button>
    </span>
  );
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
    <span className="inline-flex flex-wrap items-center gap-2">
      <ConfirmRemove
        pending={pending}
        message={`Remover ${name}? O histórico é mantido.`}
        onConfirm={() => {
          setError(null);
          start(async () => {
            const res = await removeMember(workspaceId, userId);
            if (!res.ok) setError(res.error);
          });
        }}
      />
      {error && <FormMessage>{error}</FormMessage>}
    </span>
  );
}

export function RemoveExternalButton({
  workspaceId,
  personId,
  name,
}: {
  workspaceId: string;
  personId: string;
  name: string;
}) {
  const { error, pending, setError, start } = useAction();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <ConfirmRemove
        pending={pending}
        message={`Remover ${name}?`}
        onConfirm={() => {
          setError(null);
          start(async () => {
            const res = await removeExternalPerson(workspaceId, personId);
            if (!res.ok) setError(res.error);
          });
        }}
      />
      {error && <FormMessage>{error}</FormMessage>}
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
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="Nome da pessoa"
          aria-label="Nome da pessoa sem login"
        />
        <Button type="submit" variant="secondary" disabled={pending}>
          Adicionar
        </Button>
      </form>
      {error && <FormMessage>{error}</FormMessage>}
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
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          aria-label="Seu nome neste workspace"
        />
        <Button type="submit" variant="secondary" disabled={pending}>
          Salvar
        </Button>
      </form>
      {saved && <FormMessage kind="success">Nome atualizado.</FormMessage>}
      {error && <FormMessage>{error}</FormMessage>}
    </div>
  );
}
