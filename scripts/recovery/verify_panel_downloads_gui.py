#!/usr/bin/env python3
"""Small Windows GUI for a private, offline, read-only archive audit.

Nothing is uploaded or extracted. The original index/key stay local.
"""
from __future__ import annotations

import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, ttk

from verify_panel_downloads import check_panel_downloads


def main():
    root = tk.Tk()
    root.title("DentalFlow — Conferência privada de backup")
    root.geometry("690x415")
    root.minsize(640, 390)
    root.configure(bg="#ffffff")

    values = [tk.StringVar(), tk.StringVar(), tk.StringVar()]
    outer = ttk.Frame(root, padding=22)
    outer.pack(fill="both", expand=True)

    ttk.Label(outer, text="DentalFlow · Conferência privada", font=("Segoe UI", 17)).pack(anchor="w", pady=(0, 8))
    ttk.Label(
        outer,
        text="Verifique ZIPs baixados pelo painel Storage sem abrir documentos.\nNenhum conteúdo, nome clínico ou credencial sai deste computador.",
        wraplength=610
    ).pack(anchor="w", pady=(0, 16))

    names = ["Índice criptografado (.dfenc)", "Chave privada original (.bin)", "Pasta com ZIPs baixados"]
    for index, label in enumerate(names):
        row = ttk.Frame(outer)
        row.pack(fill="x", pady=5)
        ttk.Label(row, text=label, width=28).pack(side="left")
        ttk.Entry(row, textvariable=values[index]).pack(side="left", fill="x", expand=True, padx=(5, 6))

        def choose(i=index):
            if i == 2:
                selected = filedialog.askdirectory(title="Escolha a pasta com os downloads")
            else:
                selected = filedialog.askopenfilename(title="Escolha um arquivo privado")
            if selected:
                values[i].set(selected)

        ttk.Button(row, text="Escolher…", command=choose).pack(side="right")

    status = tk.StringVar(value="Nenhum arquivo foi conferido ainda.")
    summary = tk.StringVar(value="")
    ttk.Label(outer, textvariable=status, wraplength=620).pack(anchor="w", pady=(24, 8))
    ttk.Label(outer, textvariable=summary, wraplength=620).pack(anchor="w", pady=(0, 12))

    def completed(report, error):
        button.configure(state="normal")
        if error:
            status.set("Não foi possível concluir. Confira índice, chave e pasta de downloads.")
            summary.set("Nenhum arquivo será apagado nem alterado.")
            return
        status.set(
            f"Arquivos históricos identificados: {report['matching_downloaded_objects']}/116 "
            f"· ainda faltam {report['missing_after_local_check']}"
        )
        summary.set(
            f"Correspondência MD5: {report['strong_md5_source_matches']} · "
            f"somente nome/tamanho/CRC: {report['name_size_crc_only']} · "
            f"arquivos inválidos: {report['mismatched_or_corrupt_entries']} · "
            f"ZIPs inválidos: {report['invalid_archives']}.\n"
            "Este resultado não significa restauração nem publicação autorizada."
        )

    def start():
        if not all(x.get().strip() for x in values):
            status.set("Selecione os três caminhos acima para começar.")
            return
        button.configure(state="disabled")
        status.set("Conferindo localmente… ZIPs grandes podem exigir alguns minutos.")
        summary.set("")
        params = tuple(x.get().strip() for x in values)

        def work():
            try:
                result = check_panel_downloads(*params)
                error = False
            except Exception:
                result, error = None, True
            root.after(0, lambda: completed(result, error))

        threading.Thread(target=work, daemon=True).start()

    button = ttk.Button(outer, text="Conferir downloads (somente leitura)", command=start)
    button.pack(anchor="w", pady=8)

    ttk.Label(
        outer,
        text="Importante: não envie o índice, a chave, os ZIPs ou seus nomes ao GitHub público.",
        wraplength=620
    ).pack(anchor="w", pady=(14, 0))
    root.mainloop()


if __name__ == "__main__":
    main()
