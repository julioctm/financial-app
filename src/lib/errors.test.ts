import { describe, expect, it } from 'vitest';

import { friendlyError } from '@/lib/errors';

describe('friendlyError', () => {
  it('traduz os códigos das funções do banco', () => {
    expect(friendlyError('invite_used')).toBe('Este convite já foi utilizado.');
    expect(friendlyError('conflict')).toContain('alterado por outra pessoa');
    expect(friendlyError('split_sum_not_100')).toContain('100%');
  });

  it('reconhece o código dentro de uma mensagem maior', () => {
    expect(friendlyError('P0001: last_owner')).toBe(
      'Não é possível remover o último owner.',
    );
  });

  it('usa uma mensagem genérica para erros desconhecidos ou vazios', () => {
    expect(friendlyError('boom')).toBe('Algo deu errado. Tente novamente.');
    expect(friendlyError(undefined)).toBe('Algo deu errado. Tente novamente.');
  });
});
