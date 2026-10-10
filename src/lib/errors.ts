const MESSAGES: Record<string, string> = {
  forbidden: 'Apenas o owner do workspace pode fazer isso.',
  invite_invalid: 'Convite inválido.',
  invite_used: 'Este convite já foi utilizado.',
  invite_expired: 'Este convite expirou. Peça um novo ao owner.',
  last_owner: 'Não é possível remover o último owner.',
  not_a_member: 'Esta pessoa não é membro do workspace.',
  split_sum_not_100: 'Os percentuais precisam somar exatamente 100%.',
  split_members_mismatch:
    'O rateio deve incluir todos os membros do workspace, e somente eles.',
  split_invalid_percent:
    'Use percentuais entre 0 e 100, com até 2 casas decimais.',
};

// Maps a Postgres/RPC error message (raised by our SQL functions) to pt-BR text.
export function friendlyError(message: string | undefined): string {
  const key = Object.keys(MESSAGES).find((k) => message?.includes(k));
  return key ? MESSAGES[key] : 'Algo deu errado. Tente novamente.';
}
