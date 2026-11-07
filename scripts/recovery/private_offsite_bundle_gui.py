"""Simple local Windows GUI: encrypt and independently verify Storage ZIP backups.

All I/O is on the current Windows machine. No network calls, no upload and no
clinical names in the status text. Upload to Google Drive only AFTER success.
"""
from __future__ import annotations

import threading
from datetime import datetime, timezone
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, ttk

from private_offsite_bundle import create_bundle, verify_bundle


def main():
    root = tk.Tk()
    root.title("DentalFlow — Backup externo privado")
    root.geometry("790x570")
    root.minsize(730, 520)

    outer = ttk.Frame(root, padding=22)
    outer.pack(fill="both", expand=True)
    ttk.Label(outer, text="DentalFlow · Proteger downloads", font=("Segoe UI", 17)).pack(anchor="w")
    ttk.Label(outer, text=(
        "Criptografe os ZIPs baixados pelo Storage antes de enviá-los ao Google Drive.\n"
        "Este programa é totalmente offline. NÃO envie a chave ao Drive, GitHub ou chat."
    ), wraplength=720).pack(anchor="w", pady=(10, 16))

    sources = [tk.StringVar(), tk.StringVar(), tk.StringVar()]
    names = [
        "Pasta original dos ZIPs",
        "Local para backup CIFRADO (escolher pasta-mãe)",
        "Local da chave PRIVADA (pasta diferente, não sincronizada)"
    ]
    for i, title in enumerate(names):
        ttk.Label(outer, text=title).pack(anchor="w", pady=(5, 2))
        row = ttk.Frame(outer)
        row.pack(fill="x", pady=(0, 4))
        ttk.Entry(row, textvariable=sources[i]).pack(side="left", fill="x", expand=True)
        def choose(idx=i):
            selected = filedialog.askdirectory(title=names[idx])
            if selected:
                sources[idx].set(selected)
        ttk.Button(row, text="Escolher", command=choose).pack(side="right", padx=(8, 0))

    consent = tk.BooleanVar(value=False)
    ttk.Checkbutton(outer, variable=consent, text=(
        "Confirmo que a pasta da CHAVE não é sincronizada com Google Drive/OneDrive."
    )).pack(anchor="w", pady=(14, 8))

    status = tk.StringVar(value="Aguardando escolha das três pastas.")
    detail = tk.StringVar(value="")
    ttk.Label(outer, textvariable=status, wraplength=730).pack(anchor="w", pady=(10, 8))
    ttk.Label(outer, textvariable=detail, wraplength=730).pack(anchor="w")

    def finish(report, error, out, keyfile):
        run.configure(state="normal")
        if error:
            status.set("Operação interrompida sem sucesso. Nenhum backup externo foi confirmado.")
            detail.set("Confira as pastas, permissões e espaço em disco. Não apague os ZIPs originais.")
            return
        status.set(
            f"Criptografia e leitura de volta concluídas: {report['verified_files']} arquivos, "
            f"{report['verified_plaintext_bytes']:,} bytes verificados.".replace(",", ".")
        )
        detail.set(
            f"BACKUP CIFRADO: {out}\nCHAVE PRIVADA (guardar separada): {keyfile}\n"
            "Envie SOMENTE a pasta cifrada ao Drive, verifique a sincronização e mantenha a chave local."
        )

    def start():
        if not all(v.get().strip() for v in sources) or not consent.get():
            status.set("Selecione as três pastas e confirme que a chave fica fora do Drive.")
            return
        source, dest_parent, key_parent = [Path(x.get()).resolve() for x in sources]
        if dest_parent == key_parent or dest_parent in key_parent.parents or key_parent in dest_parent.parents:
            status.set("Pasta de chave e pasta de destino não podem ser iguais ou conter uma à outra.")
            return
        suffix = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        dest = dest_parent / ("DentalFlow-Cifrado-" + suffix)
        keyfile = key_parent / ("DentalFlow-Chave-Externa-" + suffix + ".bin")
        run.configure(state="disabled")
        status.set("Criptografando e conferindo em disco. Não feche a janela durante esta operação.")
        detail.set("Nenhum arquivo original será excluído ou enviado à internet.")

        def worker():
            try:
                result = create_bundle(source, dest, keyfile)
                # Independent second pass before reporting success
                second = verify_bundle(dest, keyfile)
                if second != result:
                    raise ValueError("verification failed")
                error = False
            except Exception:
                result, error = None, True
            root.after(0, lambda: finish(result, error, dest, keyfile))

        threading.Thread(target=worker, daemon=True).start()

    def verify_external_download():
        folder = filedialog.askdirectory(title="Escolha a pasta CIFRADA baixada de volta do Google Drive")
        if not folder:
            return
        keyfile = filedialog.askopenfilename(title="Escolha a NOVA chave privada deste pacote cifrado")
        if not keyfile:
            return
        run.configure(state="disabled")
        check.configure(state="disabled")
        status.set("Conferindo autenticação e hashes de todos os arquivos cifrados…")
        detail.set("Somente leitura: o programa não envia arquivos para nenhum serviço.")

        def worker():
            try:
                report = verify_bundle(folder, keyfile)
                error = False
            except Exception:
                report, error = None, True
            def finished():
                run.configure(state="normal")
                check.configure(state="normal")
                if error:
                    status.set("O pacote não foi validado. Confira a chave e os arquivos baixados.")
                    detail.set("Não apague o pacote original nem marque a cópia externa como concluída.")
                else:
                    status.set(
                        f"Pacote cifrado autenticado: {report['verified_files']} partes, "
                        f"{report['verified_plaintext_bytes']:,} bytes.".replace(",", ".")
                    )
                    detail.set(
                        "A conferência de uma cópia baixada do Drive foi concluída. "
                        "Este programa não verifica a origem do download, nem restaura o banco."
                    )
            root.after(0, finished)

        threading.Thread(target=worker, daemon=True).start()

    buttons = ttk.Frame(outer)
    buttons.pack(anchor="w", pady=(18, 12))
    run = ttk.Button(buttons, text="Criptografar e conferir localmente", command=start)
    run.pack(side="left")
    check = ttk.Button(buttons, text="Conferir pacote cifrado baixado do Drive", command=verify_external_download)
    check.pack(side="left", padx=(12, 0))
    ttk.Label(
        outer,
        text=("Depois do upload ao Google Drive, o backup só estará validado externamente após "
              "um download de conferência. O programa não libera o beta nem substitui restauração do banco."),
        wraplength=730
    ).pack(anchor="w")
    root.mainloop()


if __name__ == "__main__":
    main()
