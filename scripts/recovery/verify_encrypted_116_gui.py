"""DentalFlow private Storage 116-object ZIP verifier; GUI never displays paths."""
from __future__ import annotations

import threading
import tkinter as tk
from tkinter import filedialog, ttk
from verify_encrypted_116 import verify_encrypted_116


def main():
    root = tk.Tk()
    root.title("DentalFlow — Conferência dos 116 anexos criptografados")
    root.geometry("830x570")
    root.minsize(745, 510)
    root.configure(bg="#ffffff")

    style = ttk.Style(root)
    style.configure("TFrame", background="#ffffff")
    style.configure("TLabel", background="#ffffff", foreground="#222222")
    style.configure("TButton", padding=(12, 9))
    outer = ttk.Frame(root, padding=28)
    outer.pack(fill="both", expand=True)

    ttk.Label(outer, text="DentalFlow · Conferir 116 arquivos",
              font=("Segoe UI", 19)).pack(anchor="w", pady=(0, 6))
    ttk.Label(outer,
              text="Verifica os ZIPs recuperados dentro do pacote cifrado do Drive.\n"
                   "Nenhum documento é extraído. O programa não acessa internet, GitHub, Lovable ou Asaas.",
              wraplength=760).pack(anchor="w", pady=(0, 18))

    sources = [tk.StringVar() for _ in range(4)]
    captions = [tk.StringVar(value="Não selecionado") for _ in range(4)]
    titles = [
        "1. Índice histórico criptografado de 29/10 (.dfenc)",
        "2. Chave privada ORIGINAL de 29/10 (.bin)",
        "3. Pasta cifrada do Drive com 14 partes + catalog.dfenc",
        "4. Chave privada NOVA do pacote de 14 partes (.bin)",
    ]
    for i, title in enumerate(titles):
        ttk.Label(outer, text=title, font=("Segoe UI", 10, "bold")).pack(
            anchor="w", pady=(0, 3))
        line = ttk.Frame(outer)
        line.pack(fill="x", pady=(0, 10))
        ttk.Label(line, textvariable=captions[i], foreground="#586270").pack(
            side="left", fill="x", expand=True)
        def pick(idx=i):
            path = (
                filedialog.askdirectory(title=titles[idx]) if idx == 2 else
                filedialog.askopenfilename(title=titles[idx])
            )
            if path:
                sources[idx].set(path)
                # No private path or basename is exposed in UI or screenshots.
                captions[idx].set("Selecionado ✓")
        ttk.Button(line, text="Escolher", command=pick).pack(side="right")

    ttk.Separator(outer, orient="horizontal").pack(fill="x", pady=(5, 15))
    status = tk.StringVar(value="Nenhuma verificação executada.")
    result = tk.StringVar(value="")
    ttk.Label(outer, textvariable=status, font=("Segoe UI", 11),
              wraplength=760).pack(anchor="w", pady=(0, 12))
    ttk.Label(outer, textvariable=result, wraplength=760).pack(anchor="w", pady=(0, 16))

    def run():
        if not all(src.get() for src in sources):
            status.set("Selecione os quatro itens para iniciar.")
            return
        if sources[1].get() == sources[3].get():
            status.set("Escolha duas chaves privadas DIFERENTES.")
            return
        button.configure(state="disabled")
        status.set("Conferindo integridade do pacote cifrado…")
        result.set("A leitura pode ser demorada. Não feche a janela.")

        def work():
            def progress(done, total):
                root.after(0, lambda d=done, t=total:
                           status.set(f"Verificação de lotes criptografados: {d}/{t}"))
            try:
                report = verify_encrypted_116(
                    *(s.get() for s in sources), on_progress=progress
                )
                error = False
            except Exception:
                report, error = None, True

            def finish():
                button.configure(state="normal")
                if error:
                    status.set("Conferência NÃO aprovada. Preserve os arquivos originais.")
                    result.set("Verifique índice de 29/10, chave original, pasta cifrada "
                               "com 14 partes e chave NOVA. Nenhum arquivo foi alterado.")
                else:
                    status.set(f"Arquivos recuperados conferidos: "
                               f"{report['recovered_objects_readable_and_verified']}/116")
                    result.set(
                        f"Pacotes cifrados autenticados: "
                        f"{report['offsite_encrypted_parts_authenticated']}/14.\n"
                        f"Correspondências com ETag MD5: {report['matching_historical_md5_etags']}. "
                        f"Sem digest histórico comparável: "
                        f"{report['without_historical_digest_for_comparison']}.\n"
                        f"Arquivos inválidos: {report['invalid_entries']}. "
                        f"ZIPs inválidos: {report['invalid_zip_files']}.\n"
                        "Sem arquivos clínicos em disco. A restauração conjunta "
                        "com o banco e o beta pago continuam pendentes."
                    )
            root.after(0, finish)
        threading.Thread(target=work, daemon=True).start()

    button = ttk.Button(outer, text="Conferir 116 arquivos (somente leitura)",
                        command=run)
    button.pack(anchor="w", pady=(0, 15))
    ttk.Label(outer, text="Importante: NÃO compartilhe as chaves, o índice, os ZIPs nem "
                            "documentos de pacientes. Envie somente as quantidades do resultado.",
              wraplength=760, foreground="#596273").pack(anchor="w")
    root.mainloop()


if __name__ == "__main__":
    main()
