"""Single-window DentalFlow DF-EID-01 integrated local restore. No private paths shown."""
from __future__ import annotations

import json
import threading
import tkinter as tk
from tkinter import filedialog, ttk

from integrated_stage3 import run_integrated_stage3

FIELDS = [
    ("1. Índice histórico de 29/10 (.dfenc)", "file"),
    ("2. Chave original do índice de 29/10 (.bin)", "file"),
    ("3. Pasta dos 33 ZIPs históricos (592 anexos)", "dir"),
    ("4. Pasta cifrada dos 14 arquivos recuperados + catalog.dfenc", "dir"),
    ("5. Chave do pacote dos 14 arquivos (.bin)", "file"),
    ("6. Pasta cifrada do BANCO de 04/11 (1 parte + catalog.dfenc)", "dir"),
    ("7. Chave do BANCO de 04/11 (.bin)", "file"),
]


def main():
    root = tk.Tk()
    root.title("DentalFlow | Etapa 3 | Recuperação integrada")
    root.geometry("900x790")
    root.minsize(780, 725)
    root.configure(bg="#ffffff")
    style = ttk.Style(root)
    style.configure("TFrame", background="#ffffff")
    style.configure("TLabel", background="#ffffff", foreground="#253047")
    style.configure("TButton", padding=(14, 9))
    frame = ttk.Frame(root, padding=27)
    frame.pack(fill="both", expand=True)

    ttk.Label(frame, text="DentalFlow  ·  Etapa 3 de 8",
              font=("Segoe UI", 21)).pack(anchor="w")
    ttk.Label(frame, text="Uma execução. Banco real isolado + amostra dos anexos + vínculos + reversão.",
              font=("Segoe UI", 10), foreground="#536276").pack(anchor="w", pady=(3, 6))
    ttk.Label(frame,
              text="Pré-requisito: Docker Desktop iniciado e imagem supabase/postgres:17.11.0.018 já instalada. "
                   "Desconecte a internet para o ensaio. Nenhuma chave ou arquivo clínico sai do computador.",
              wraplength=820, foreground="#536276").pack(anchor="w", pady=(0, 15))

    values = [tk.StringVar() for _ in FIELDS]
    labels = [tk.StringVar(value="Ainda não escolhido") for _ in FIELDS]
    for i, (title, kind) in enumerate(FIELDS):
        row = ttk.Frame(frame)
        row.pack(fill="x", pady=(0, 10))
        text = ttk.Frame(row)
        text.pack(side="left", fill="x", expand=True)
        ttk.Label(text, text=title, font=("Segoe UI", 10, "bold")).pack(anchor="w")
        ttk.Label(text, textvariable=labels[i], foreground="#69778a").pack(anchor="w")
        def pick(idx=i, entry_type=kind):
            selected = (filedialog.askdirectory(title=FIELDS[idx][0]) if entry_type == "dir"
                        else filedialog.askopenfilename(title=FIELDS[idx][0]))
            if selected:
                values[idx].set(selected)
                labels[idx].set("Selecionado \u2713")
        ttk.Button(row, text="Escolher", command=pick).pack(side="right", padx=(8, 0))

    ttk.Separator(frame, orient="horizontal").pack(fill="x", pady=(0, 13))
    progress_text = tk.StringVar(value="Selecione os sete itens para começar.")
    ttk.Label(frame, textvariable=progress_text, wraplength=825,
              font=("Segoe UI", 10)).pack(anchor="w", pady=(0, 10))
    bar = ttk.Progressbar(frame, mode="indeterminate")
    bar.pack(fill="x", pady=(0, 13))

    note = tk.StringVar(value="Nenhum dado clínico ou segredo será exibido no relatório.")
    ttk.Label(frame, textvariable=note, wraplength=825, foreground="#536276").pack(
        anchor="w", pady=(0, 15))
    receipt = {"value": None}

    def save_report():
        if not receipt["value"]:
            return
        dest = filedialog.asksaveasfilename(
            title="Salvar apenas contagens e status (sem dados clínicos)",
            initialfile="DentalFlow-DF-EID-01-Recibo.json",
            defaultextension=".json", filetypes=[("JSON", "*.json")])
        if dest:
            try:
                with open(dest, "x", encoding="utf-8") as f:
                    json.dump(receipt["value"], f, ensure_ascii=False, indent=2)
                note.set("Recibo agregado salvo em local escolhido. Nunca envie os backups ou chaves.")
            except FileExistsError:
                note.set("O arquivo já existe. Escolha um novo nome; não sobrescrevemos recibos.")
            except OSError:
                note.set("Não foi possível salvar o recibo. Escolha uma pasta local acessível.")

    save = ttk.Button(frame, text="Salvar recibo sem dados pessoais",
                      command=save_report, state="disabled")

    def start():
        if any(not x.get() for x in values):
            progress_text.set("Escolha todos os sete itens (três chaves privadas distintas).")
            return
        button.configure(state="disabled")
        save.configure(state="disabled")
        receipt["value"] = None
        bar.start(12)
        progress_text.set("Executando verificação privada no Windows...")
        note.set("Não feche o aplicativo até a conclusão. A restauração é somente local e descartável.")
        selected = [x.get() for x in values]

        def progress(message):
            root.after(0, lambda m=message: progress_text.set(m))

        def work():
            try:
                result = run_integrated_stage3(*selected, progress=progress)
                code = None
            except Exception as err:
                # Only allow known stage 3 codes, never exception strings or filenames.
                raw = str(err)
                code = raw if raw.startswith(("DF_STAGE3_", "DF_DOCKER_", "DF_ISOLATED_",
                                               "DF_RESTORE_", "DF_POSTGRES_")) else "DF_STAGE3_PRIVATE_INTEGRATION_UNVERIFIED"
                result = None

            def finish():
                bar.stop()
                button.configure(state="normal")
                if result is None:
                    progress_text.set("Ensaio NÃO aprovado: " + code)
                    note.set("Originais preservados. Confirme as sete seleções, imagem Docker local e espaço em disco. "
                             "Envie apenas o código de erro, nunca os arquivos, chaves ou telas com dados.")
                    return
                receipt["value"] = result
                save.configure(state="normal")
                counts = (result["restored_patients"], result["restored_cases"],
                          result["restored_appointments"], result["restored_storage_metadata_rows"])
                progress_text.set(
                    f"Banco restaurado: {counts[0]} pacientes, {counts[1]} casos, "
                    f"{counts[2]} agendamentos, {counts[3]} linhas Storage.")
                note.set(
                    f"Amostra restaurada: {result['sampled_from_592']} dos 592 e "
                    f"{result['sampled_from_116']} dos 116. "
                    f"Arquivos abertos por parser: {result['sampled_items_opened_in_trusted_parser']}. "
                    f"Vínculos conferidos: {result['sampled_items_linked_to_restored_db']}. "
                    f"Reversão: {'OK' if result['rollback_in_isolated_pg_verified'] else 'pendente'}. "
                    f"Contêiner removido: {'SIM' if result['isolated_database_disposed'] else 'NÃO'}. "
                    f"Resultado: {result['status']}. "
                    "Acesso pela interface QA é um aceite SEPARADO; este teste não publica o beta.")
            root.after(0, finish)
        threading.Thread(target=work, daemon=True).start()

    button = ttk.Button(frame, text="Executar ensaio integrado (somente nesta máquina)",
                        command=start)
    button.pack(anchor="w", pady=(0, 10))
    save.pack(anchor="w")
    root.mainloop()


if __name__ == "__main__":
    main()
