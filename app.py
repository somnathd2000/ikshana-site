import os
import subprocess
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk


DEFAULT_SEARCH_ROOT = Path(r"C:\Business")


class FileFinderApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Business File Finder")
        self.root.geometry("900x560")
        self.root.minsize(760, 480)

        self.folder_var = tk.StringVar(value=str(DEFAULT_SEARCH_ROOT))
        self.query_var = tk.StringVar()
        self.status_var = tk.StringVar(value="Enter part of a filename to search.")
        self.search_button: ttk.Button | None = None
        self.progress_bar: ttk.Progressbar | None = None

        self._build_ui()

    def _build_ui(self) -> None:
        frame = ttk.Frame(self.root, padding=16)
        frame.pack(fill="both", expand=True)

        title = ttk.Label(
            frame,
            text="Business File Finder",
            font=("Segoe UI", 18, "bold"),
        )
        title.pack(anchor="w")

        subtitle = ttk.Label(
            frame,
            text="Search for files inside your business folder on the C: drive.",
        )
        subtitle.pack(anchor="w", pady=(4, 16))

        controls = ttk.Frame(frame)
        controls.pack(fill="x")

        ttk.Label(controls, text="Business folder").grid(row=0, column=0, sticky="w")
        folder_entry = ttk.Entry(controls, textvariable=self.folder_var)
        folder_entry.grid(row=1, column=0, sticky="ew", padx=(0, 8))

        browse_button = ttk.Button(controls, text="Browse...", command=self.pick_folder)
        browse_button.grid(row=1, column=1, sticky="ew")

        ttk.Label(controls, text="Filename contains").grid(
            row=2, column=0, sticky="w", pady=(12, 0)
        )
        query_entry = ttk.Entry(controls, textvariable=self.query_var)
        query_entry.grid(row=3, column=0, sticky="ew", padx=(0, 8), pady=(0, 12))
        query_entry.bind("<Return>", self.start_search)

        self.search_button = ttk.Button(controls, text="Search", command=self.start_search)
        self.search_button.grid(row=3, column=1, sticky="ew", pady=(0, 12))

        self.progress_bar = ttk.Progressbar(controls, mode="indeterminate")
        self.progress_bar.grid(row=4, column=0, columnspan=2, sticky="ew", pady=(0, 4))
        self.progress_bar.grid_remove()

        controls.columnconfigure(0, weight=1)

        actions = ttk.Frame(frame)
        actions.pack(fill="x", pady=(0, 10))

        ttk.Button(actions, text="Open File", command=self.open_selected_file).pack(
            side="left"
        )
        ttk.Button(
            actions, text="Open Containing Folder", command=self.open_selected_folder
        ).pack(side="left", padx=(8, 0))

        results_frame = ttk.Frame(frame)
        results_frame.pack(fill="both", expand=True)

        columns = ("name", "folder")
        self.results = ttk.Treeview(
            results_frame, columns=columns, show="headings", height=18
        )
        self.results.heading("name", text="File Name")
        self.results.heading("folder", text="Folder")
        self.results.column("name", width=240, anchor="w")
        self.results.column("folder", width=600, anchor="w")
        self.results.pack(side="left", fill="both", expand=True)
        self.results.bind("<Double-1>", lambda _event: self.open_selected_file())

        scrollbar = ttk.Scrollbar(
            results_frame, orient="vertical", command=self.results.yview
        )
        self.results.configure(yscrollcommand=scrollbar.set)
        scrollbar.pack(side="right", fill="y")

        status = ttk.Label(frame, textvariable=self.status_var)
        status.pack(anchor="w", pady=(10, 0))

    def pick_folder(self) -> None:
        selected = filedialog.askdirectory(initialdir=self.folder_var.get() or r"C:\\")
        if selected:
            self.folder_var.set(selected)

    def start_search(self, _event=None) -> None:
        search_root = Path(self.folder_var.get().strip())
        query = self.query_var.get().strip().lower()

        if not search_root.exists() or not search_root.is_dir():
            messagebox.showerror(
                "Folder not found",
                "Choose a valid business folder before searching.",
            )
            return

        if not query:
            messagebox.showinfo(
                "Search term needed",
                "Enter part of a filename to search for.",
            )
            return

        self._set_busy(True)
        self.status_var.set(f"Searching inside {search_root} ...")
        self._clear_results()

        worker = threading.Thread(
            target=self._search_files,
            args=(search_root, query),
            daemon=True,
        )
        worker.start()

    def _search_files(self, search_root: Path, query: str) -> None:
        matches: list[Path] = []

        try:
            for current_root, _dirs, files in os.walk(search_root, onerror=lambda _err: None):
                for file_name in files:
                    if query in file_name.lower():
                        matches.append(Path(current_root) / file_name)
        except PermissionError:
            self.root.after(
                0,
                lambda: self._finish_search_error(
                    "Access was denied while scanning that folder."
                ),
            )
            return
        except OSError as exc:
            self.root.after(
                0,
                lambda: self._finish_search_error(f"Search failed: {exc}"),
            )
            return

        self.root.after(0, lambda: self._finish_search(matches))

    def _finish_search(self, matches: list[Path]) -> None:
        for path in matches:
            self.results.insert("", "end", values=(path.name, str(path.parent)))

        count = len(matches)
        if count == 0:
            self.status_var.set("No matching files were found.")
            messagebox.showinfo("No files found", "No file has been found.")
        elif count == 1:
            self.status_var.set("Found 1 matching file.")
        else:
            self.status_var.set(f"Found {count} matching files.")

        self._set_busy(False)

    def _finish_search_error(self, message: str) -> None:
        self.status_var.set(message)
        self._set_busy(False)
        messagebox.showerror("Search failed", message)

    def _clear_results(self) -> None:
        for item in self.results.get_children():
            self.results.delete(item)

    def _set_busy(self, is_busy: bool) -> None:
        if self.search_button is not None:
            state = "disabled" if is_busy else "normal"
            self.search_button.config(state=state)

        if self.progress_bar is not None:
            if is_busy:
                self.progress_bar.grid()
                self.progress_bar.start(12)
            else:
                self.progress_bar.stop()
                self.progress_bar.grid_remove()

    def _selected_path(self) -> Path | None:
        selected = self.results.selection()
        if not selected:
            messagebox.showinfo("Select a file", "Choose a search result first.")
            return None

        item = selected[0]
        file_name, folder = self.results.item(item, "values")
        return Path(folder) / file_name

    def open_selected_file(self) -> None:
        selected_path = self._selected_path()
        if not selected_path:
            return

        try:
            self._open_path(selected_path)
        except OSError as exc:
            messagebox.showerror("Open failed", str(exc))

    def open_selected_folder(self) -> None:
        selected_path = self._selected_path()
        if not selected_path:
            return

        try:
            self._open_path(selected_path.parent)
        except OSError as exc:
            messagebox.showerror("Open failed", str(exc))

    @staticmethod
    def _open_path(path: Path) -> None:
        if sys.platform.startswith("win"):
            os.startfile(path)  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.run(["open", str(path)], check=True)
        else:
            subprocess.run(["xdg-open", str(path)], check=True)


def main() -> None:
    root = tk.Tk()
    style = ttk.Style()
    if "vista" in style.theme_names():
        style.theme_use("vista")

    FileFinderApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
