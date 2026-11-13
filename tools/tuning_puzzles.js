/* Gerado por tools/gen_puzzles.js (semente 777). Todos têm solução única. */
var SUDOKU_TIERS = {"facil":{"label":"Fácil"},"medio":{"label":"Médio"},"dificil":{"label":"Difícil"},"muito_dificil":{"label":"Muito difícil"}};
var SUDOKU_PUZZLES = {
 "facil": [
  {
   "id": "facil-1",
   "grid": "007694821961008007000073000030007590090000070702905000070469083080051009009380006",
   "clues": 38,
   "singles": true,
   "nodes": 43
  },
  {
   "id": "facil-2",
   "grid": "000008006009020037563094080630270000005981763070003050004600000006042008152037040",
   "clues": 38,
   "singles": true,
   "nodes": 102
  },
  {
   "id": "facil-3",
   "grid": "000704000000100070260000004109047050650019000784653921070390040801002095046500300",
   "clues": 38,
   "singles": true,
   "nodes": 43
  },
  {
   "id": "facil-4",
   "grid": "204050100750134020009028340300089000080000239900300007020810593090640000500200680",
   "clues": 38,
   "singles": true,
   "nodes": 43
  }
 ],
 "medio": [
  {
   "id": "medio-1",
   "grid": "070610040005009010060540080304087209089000170000390000000200030706030000010750400",
   "clues": 32,
   "singles": true,
   "nodes": 49
  },
  {
   "id": "medio-2",
   "grid": "006000400400600008059400200021750000800240000590810070040367000002004065600020007",
   "clues": 32,
   "singles": true,
   "nodes": 114
  },
  {
   "id": "medio-3",
   "grid": "903068001000000004004000369207010045340059000005004902008002050409000087010005000",
   "clues": 32,
   "singles": true,
   "nodes": 74
  },
  {
   "id": "medio-4",
   "grid": "130850007400070018000100400659000102000010080300045760500000300704021006010000070",
   "clues": 32,
   "singles": true,
   "nodes": 71
  }
 ],
 "dificil": [
  {
   "id": "dificil-1",
   "grid": "058020003000700006601000092010800300000000000000076085000061200002000000804230960",
   "clues": 27,
   "singles": false,
   "nodes": 168
  },
  {
   "id": "dificil-2",
   "grid": "000000400900070200620803500003760040860049000040000061010050000007408090000007000",
   "clues": 27,
   "singles": false,
   "nodes": 581
  },
  {
   "id": "dificil-3",
   "grid": "000006000090051436600030500009000800000320690000000050040760001010000200006203005",
   "clues": 27,
   "singles": false,
   "nodes": 79
  },
  {
   "id": "dificil-4",
   "grid": "000000800000200000000703609800500000360802017000906030170600480006320000530000000",
   "clues": 27,
   "singles": false,
   "nodes": 895
  }
 ],
 "muito_dificil": [
  {
   "id": "muito_dificil-1",
   "grid": "000004000800700100657080004030000000029007000000060090002003800048070000000006035",
   "clues": 24,
   "singles": false,
   "nodes": 77
  },
  {
   "id": "muito_dificil-2",
   "grid": "085007090600000000009030500100085003000003010058000000070094000904050000002000600",
   "clues": 24,
   "singles": false,
   "nodes": 1528
  },
  {
   "id": "muito_dificil-3",
   "grid": "000100000490700000073050000000080900000900050000003840050000064040006030860070020",
   "clues": 24,
   "singles": false,
   "nodes": 1886
  },
  {
   "id": "muito_dificil-4",
   "grid": "005400081000300007020005000000000290003080000004700100190000006040901000070006900",
   "clues": 24,
   "singles": false,
   "nodes": 1551
  }
 ]
};
if (typeof module !== 'undefined' && module.exports) module.exports = { SUDOKU_TIERS: SUDOKU_TIERS, SUDOKU_PUZZLES: SUDOKU_PUZZLES };
