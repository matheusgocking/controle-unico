/* Modelos do prontuário (29/09/2026): o texto que a Clínica monta para cada situação da sessão.
   Fonte única dos textos: o app lê daqui, e o script que escreve no Word vai ler daqui também.
   Nada de paciente neste arquivo, porque o site é público.

   Os textos vêm de "Padrões de Escrita do Prontuário" (seção 3) e da skill "Registrar Sessão no
   Prontuário" (5.2 a 5.4), escritos no masculino, como o modelo do Word: o app flexiona para
   paciente mulher. Cada {campo} vira uma caixa para preencher; os campos com nome especial são
   preenchidos sozinhos (FULANO, data da sessão) ou viram escolha (realizou/não realizou) ou data. */
var MODELOS_PRONTUARIO = {
  /* sessão que aconteceu (vale também para a cortesia): vira o Registro da Evolução, e o
     Word abre a sessão seguinte. As linhas com "opcional" podem ser tiradas. */
  realizada: {
    linhas: [
      {id:"relato",    texto:"No início do atendimento, o paciente relatou os acontecimentos desde o último encontro, incluindo {relatos relevantes}."},
      {id:"tarefa",    texto:"{FULANO} {realizou/não realizou} a atividade acordada anteriormente, a qual foi revisada durante a sessão.", opcional:true, rotulo:"Havia tarefa da semana anterior"},
      {id:"tema",      texto:"Durante o atendimento, foi trabalhado {tema ou alvo clínico}, com o objetivo de {objetivo da intervenção}."},
      {id:"tecnica",   texto:"Além disso, foi realizado {técnica específica}, buscando {objetivo da técnica}.", opcional:true, rotulo:"Houve técnica específica"},
      {id:"atividade", texto:"Como atividade para a próxima semana, ficou acordado que o paciente {atividade}, buscando {objetivo da atividade}.", opcional:true, rotulo:"Ficou tarefa para a próxima semana"}
    ]
  },
  /* não compareceu sem aviso de 24 horas: cobra, e o Word abre a sessão seguinte */
  falta: {
    evolucao: "O paciente não compareceu à sessão no horário previamente acordado e não apresentou justificativa prévia ao psicólogo."
  },
  /* remarcada: o bloco passa para a data nova, o contato vai para o Registro Complementar e
     a evolução continua em aberto, esperando o atendimento. Não abre sessão seguinte. */
  remarcada: {
    paciente: {
      rotulo: "O paciente pediu",
      complementar: "No período entre as sessões ({data do contato}), o paciente entrou em contato com o psicólogo (via WhatsApp) solicitando o reagendamento da consulta semanal. Diante disso, ficou acordado que o próximo encontro será realizado no dia {nova data}."
    },
    psicologo: {
      rotulo: "Eu remarquei",
      complementar: "No período entre sessões ({data do contato}), o psicólogo informou ao paciente que a consulta do dia {data da sessão} não será realizada em decorrência de {motivo}. Diante disso, ficou acordado que o próximo encontro será realizado no dia {nova data}."
    },
    cobranca: {
      rotulo: "Sem pagamento",
      complementar: "No período entre sessões ({data do contato}), o psicólogo entrou em contato com o paciente (via WhatsApp), realizando a cobrança referente ao pagamento mensal dos atendimentos, sem que o paciente apresentasse retorno ao contato realizado. Dessa forma, o atendimento da semana não foi realizado em decorrência da ausência de pagamento prévio."
    }
  },
  /* não haverá sessão nesta data: o aviso vai para o Registro Complementar e o bloco passa
     para a sessão seguinte, como na remarcação */
  cancelada: {
    complementar: "No período entre sessões ({data do contato}), o psicólogo informou ao paciente que a consulta do dia {data da sessão} não será realizada em decorrência de {motivo}."
  }
};

/* O modelo é escrito no masculino; para paciente mulher, só artigos e preposições mudam,
   porque "paciente" serve aos dois. As mesmas regras do Set-Genero do script do Word. */
function flexionarProntuario(texto, genero){
  if(genero !== "F") return texto;
  return texto
    .replace(/\bAo paciente\b/g, "À paciente").replace(/\bao paciente\b/g, "à paciente")
    .replace(/\bPelo paciente\b/g, "Pela paciente").replace(/\bpelo paciente\b/g, "pela paciente")
    .replace(/\bDo paciente\b/g, "Da paciente").replace(/\bdo paciente\b/g, "da paciente")
    .replace(/\bNo paciente\b/g, "Na paciente").replace(/\bno paciente\b/g, "na paciente")
    .replace(/\bO paciente\b/g, "A paciente").replace(/\bo paciente\b/g, "a paciente");
}
