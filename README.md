# Sudoku e metaheurísticas

Laboratório de experimentos que roda **inteiro no navegador** (HTML + JavaScript, sem servidor, sem instalação).
Você escolhe a **dificuldade**, o **número de execuções** e os **métodos**, e a página mostra taxa de sucesso,
esforço (avaliações), tempo, convergência e testes estatísticos, com exportação em CSV/JSON.

Métodos disponíveis:

| Método | O que é |
|---|---|
| **AG (artigo)** | Réplica do AG de Mantere e Koljonen (2007) a partir da descrição: população 21, elitismo, pais sorteados entre os melhor colocados, cruzamento por blocos, mutação com folga, envelhecimento, reinício em 2000 gerações |
| **AG sem cruzamento** | Mesmo AG, mas cada filho é cópia de um pai + mutação (ablação: isola o efeito do cruzamento) |
| **Simulated Annealing** | Uma solução; vizinhança = troca de duas células livres no mesmo bloco; resfriamento geométrico com reinício |
| **AG memético** | AG em que cada filho passa por uma busca local de trocas dentro dos blocos |
| **Backtracking** | Solver exato (MRV), só como referência de tempo |

Todos usam a mesma codificação (81 posições, blocos 3x3 sempre permutações de 1 a 9, pistas fixas) e a mesma
aptidão (2 por dígito ausente em cada linha e coluna; 0 = solução).

## Publicar no GitHub Pages (passo a passo)

1. Crie um repositório novo no GitHub (por exemplo `sudoku-metaheuristicas`), público.
2. Envie **o conteúdo desta pasta** para a raiz do repositório (o `index.html` precisa ficar na raiz).
   Pela web: botão **Add file > Upload files**, arraste tudo (inclusive as pastas `js`, `css`, `tools`, `test`) e confirme o commit.
   Pelo terminal:
   ```bash
   cd sudoku-metaheuristicas
   git init && git add . && git commit -m "Laboratório de Sudoku e metaheurísticas"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/sudoku-metaheuristicas.git
   git push -u origin main
   ```
3. No repositório: **Settings > Pages > Build and deployment**, em *Source* escolha **Deploy from a branch**,
   branch **main**, pasta **/ (root)**, e salve.
4. Em 1 a 2 minutos a página fica em `https://SEU_USUARIO.github.io/sudoku-metaheuristicas/`.

Para rodar localmente: abra o `index.html` direto no navegador, ou, se preferir um servidor local,
`python3 -m http.server 8000` dentro da pasta e acesse `http://localhost:8000`.

## Como usar

1. Escolha a **dificuldade** (ou "Personalizado" para colar um puzzle de 81 caracteres, `0` ou `.` = vazio).
2. Escolha **um puzzle** ou todos os do nível.
3. Marque os **métodos**, defina **execuções por puzzle**, **limite de avaliações** (100 mil, como no artigo) e **semente**.
4. **Executar.** Os resultados aparecem enquanto roda; **Parar** mantém os resultados parciais.
5. Use **Copiar tabela (Markdown)**, **Baixar execuções (CSV)**, **Baixar resumo (CSV)** ou **Baixar tudo (JSON)** para levar os números ao artigo.

As execuções rodam em paralelo em Web Workers (um por núcleo, ajustável em *Parâmetros avançados*).
Se o navegador bloquear workers, a página roda na thread principal, só mais devagar.

## O que a página mostra

- **Resumo por método:** execuções, sucessos, taxa de sucesso com intervalo de confiança de Wilson (95%),
  mediana e quartis de avaliações até resolver, média ± desvio padrão, tempo médio e aptidão final dos fracassos.
- **Gráficos:** taxa de sucesso, distribuição das avaliações (escala log) e curva de convergência (mediana da melhor aptidão).
- **Comparação entre métodos:** teste de Mann-Whitney (p-valor, p ajustado por Bonferroni e A12 como tamanho de efeito)
  sobre as avaliações usadas; quem não resolveu entra com o valor do limite.
- **Detalhe por puzzle** (quando há vários) e a **última grade** produzida, com conflitos destacados.

## Decisões de implementação (leia antes de citar no artigo)

- **Avaliação = uma solução candidata avaliada.** No AG é uma grade completa; no SA e na busca local é uma vizinha
  (avaliada de forma incremental, portanto mais barata em tempo). Por isso o tempo é reportado separadamente.
- **O AG é uma réplica a partir da descrição**, não do código dos autores. Dois detalhes não ficaram fixados e foram decididos aqui:
  1. a **folga** conta as ocorrências do dígito movido na linha e na coluna de destino (a própria célula conta nas duas);
     "folga 3" admite uma ocorrência extra;
  2. a mutação sorteia as posições **só entre células livres** (a leitura literal, "se tocar uma pista, interrompe", fica disponível desligando a opção).
- **Calibração em puzzles separados.** Esses dois pontos e os parâmetros do SA e da busca local foram escolhidos
  em `tools/tuning_puzzles.js` (4 puzzles por nível, semente 777), nunca nos puzzles da página. Resultados no conjunto de
  calibração (8 execuções por puzzle, limite de 100 mil avaliações; taxa de sucesso por nível fácil / médio / difícil / muito difícil):

  | Configuração | Fácil | Médio | Difícil | Muito difícil |
  |---|---:|---:|---:|---:|
  | AG (padrão) | 94% | 66% | 13% | 6% |
  | AG sem cruzamento | 97% | 59% | 9% | 0% |
  | SA | 100% | 97% | 19% | 16% |
  | AG memético | 94% | 66% | 16% | 3% |
  | AG com folga desligada | 0% | 0% | 0% | 0% |
  | AG com folga 2 | 0% | 0% | 0% | 0% |
  | AG com leitura literal da mutação | 56% | 16% | 3% | 0% |

  Esses números são do conjunto de calibração, com poucas execuções (±10 pontos de ruído), e **não** são os resultados do artigo:
  gere os resultados finais na página, com mais execuções, nos puzzles dos níveis.
  O padrão "sem folga ou com folga menor fica muito pior" concorda com o que o artigo descreve para a folga.
- **Níveis de dificuldade** = número de pistas (38, 32, 27 e até 24) + técnica necessária (fácil: só "singles"; difícil e muito difícil: não).
  Não é a classificação dos jornais usada no artigo. Todos os puzzles têm **solução única**, verificada pelo solver exato
  (`tools/gen_puzzles.js`, semente 20261111). Para usar outro conjunto, use "Personalizado".
- **Reprodutibilidade:** cada execução usa uma semente derivada da semente base, do puzzle e do número da execução.
- **Estatística:** execuções de puzzles diferentes agrupadas não são independentes e identicamente distribuídas;
  para o artigo, reporte também por puzzle ou rode um puzzle por vez.

## Estrutura

```
index.html          página
css/style.css       estilos (claro/escuro, responsivo)
js/core.js          algoritmos (AG, AG sem cruzamento, SA, AG memético, backtracking); roda em Node e em Web Worker
js/stats.js         estatística descritiva e Mann-Whitney
js/puzzles.js       puzzles por nível (gerados, solução única)
js/app.js           interface, pool de workers, gráficos, exportação
tools/              gerador de puzzles, calibração (tune.js) e puzzles de calibração
test/test_core.js   testes de invariantes: node test/test_core.js
```

Para regenerar os puzzles: `node tools/gen_puzzles.js`. Para recalibrar:
`node tools/tune.js '[{"name":"sa","method":"sa","params":{}}]' 8 100000`.

## Limitações

- O AG replica a **descrição** do artigo; resultados absolutos podem diferir dos dos autores.
- Puzzles gerados aleatoriamente não equivalem aos puzzles de jornal, e a dificuldade medida pelo número de pistas é só uma aproximação.
- Resultados dependem do computador (tempo) e dos parâmetros; registre a configuração (o JSON exportado já guarda).
