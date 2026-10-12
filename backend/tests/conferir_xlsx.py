"""Validação cruzada do .xlsx gerado no navegador (frontend/tests/escrita_xlsx.mjs)
com openpyxl e pandas: abre, mantém AWB com zero à esquerda como texto e
preserva acentos, aspas, vírgulas, <tags> e quebras de linha.
    python tests/conferir_xlsx.py /tmp/saida_teste.xlsx
"""
import sys
import warnings

import openpyxl
import pandas as pd

warnings.filterwarnings("ignore")
caminho = sys.argv[1]
ws = openpyxl.load_workbook(caminho).active
linhas = list(ws.iter_rows(values_only=True))
assert linhas[0] == ("Waybill No", "Consignee City", "Observação", "Vazio"), linhas[0]
assert linhas[1][2] == 'Com "aspas", vírgula & <tag>', linhas[1]
assert linhas[2][2] == "Linha\ncom quebra", linhas[2]
assert linhas[3][0] == "0012345" and isinstance(linhas[3][0], str), linhas[3]
df = pd.read_excel(caminho, dtype=str)
assert list(df["Waybill No"]) == ["SP123456789BR", "RJ000111222BR", "0012345"], list(df["Waybill No"])
assert df.loc[2, "Consignee City"] == "Açaí"
print("ok  openpyxl e pandas leem o .xlsx; AWB '0012345' segue texto; caracteres especiais preservados")
