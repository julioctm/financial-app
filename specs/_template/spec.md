# [Nome da Feature]

**Status:** Draft | In Review | Approved | Implemented
**Spec ID:** NNN-nome-curto
**Autor:** 
**Data:** YYYY-MM-DD

## 1. Contexto e Motivação

Por que essa feature existe? Que problema do usuário ela resolve? Qual dor atual (se houver) ela elimina?

## 2. Objetivo

O que exatamente essa feature deve entregar. Seja específico — evite descrições vagas tipo "melhorar a experiência".

## 3. Fora de Escopo

O que essa spec explicitamente NÃO cobre (evita ambiguidade e scope creep durante a implementação).

## 4. Requisitos Funcionais

Lista numerada do que o sistema deve fazer. Cada item deve ser testável.

1. O sistema deve...
2. O usuário deve poder...
3. Quando X acontecer, o sistema deve...

## 5. Requisitos Não-Funcionais

Performance, segurança, acessibilidade, limites, etc. (quando relevante).

## 6. Modelo de Dados

Tabelas, campos, relacionamentos envolvidos (se a feature tocar o banco).

```
tabela_exemplo
├── id (uuid, pk)
├── campo_x (tipo)
└── created_at (timestamp)
```

## 7. Regras de Negócio

Validações, cálculos, condições especiais que a lógica precisa respeitar.

## 8. Fluxos de UI/UX (se aplicável)

Telas, estados (loading, erro, vazio), navegação envolvida. Pode linkar protótipos/wireframes.

## 9. Casos de Borda

Situações não óbvias que a implementação precisa tratar (valores negativos, dados duplicados, limites, etc.)

## 10. Critérios de Aceite

Lista do que precisa ser verdade para considerar a feature pronta. Formato Given/When/Then é bem-vindo.

- [ ] Dado que..., quando..., então...
- [ ] Dado que..., quando..., então...

## 11. Perguntas Abertas

Dúvidas ainda não resolvidas que podem impactar a implementação.
