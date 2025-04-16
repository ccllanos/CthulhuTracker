import tkinter as tk
from tkinter import ttk
import json
from tkinter import messagebox
from typing import Dict, List, Optional

# --- Constants ---
BOUTS_OF_MADNESS_REALTIME = [
    "Amnesia: Olvida eventos recientes (1D10 asaltos).",
    "Discapacidad Psicosomática: Ceguera, sordera, parálisis (1D10 asaltos).",
    "Violencia: Ataca indiscriminadamente (1D10 asaltos).",
    "Paranoia: Desconfianza extrema, todos conspiran (1D10 asaltos).",
    "Persona Significativa: Confunde a alguien con figura clave de su Trasfondo (1D10 asaltos).",
    "Desmayo: Inconsciente (1D10 asaltos).",
    "Huir en Pánico: Corre sin control (1D10 asaltos).",
    "Histeria/Explosión Emocional: Risa, llanto, gritos incontrolables (1D10 asaltos).",
    "Fobia: Adquiere nueva fobia (Tira/Elige p.164), reacciona a ella (1D10 asaltos).",
    "Manía: Adquiere nueva manía (Tira/Elige p.166), actúa según ella (1D10 asaltos).",
]

TRASFONDO_KEYS = ["descripcion", "ideologia", "allegados", "lugares", "posesiones", "rasgos",
                 "lesiones", "fobiasManias", "tomos", "encuentros"]

# --- Interfaces (Data Classes) ---
class PlayerStatuses:
    def __init__(self, heridaGrave: bool = False, inconsciente: bool = False, locuraTemporal: bool = False,
                 locuraIndefinida: bool = False, locuraSubyacente: bool = False, moribundo: bool = False,
                 estabilizado: bool = False, muerto: bool = False):
        self.heridaGrave = heridaGrave
        self.inconsciente = inconsciente
        self.locuraTemporal = locuraTemporal
        self.locuraIndefinida = locuraIndefinida
        self.locuraSubyacente = locuraSubyacente
        self.moribundo = moribundo
        self.estabilizado = estabilizado
        self.muerto = muerto

class PendingChecks:
    def __init__(self, needsMajorWoundConCheck: bool = False, needsTempInsanityIntCheck: bool = False,
                 needsIndefiniteInsanityConfirmation: bool = False, needsDyingConCheck: bool = False,
                 needsSubyacenteConfirmation: bool = False):
        self.needsMajorWoundConCheck = needsMajorWoundConCheck
        self.needsTempInsanityIntCheck = needsTempInsanityIntCheck
        self.needsIndefiniteInsanityConfirmation = needsIndefiniteInsanityConfirmation
        self.needsDyingConCheck = needsDyingConCheck
        self.needsSubyacenteConfirmation = needsSubyacenteConfirmation

class PlayerData:
    def __init__(self, nombre: str = "", personaje: str = "",
                 stats: Optional[Dict[str, int]] = None,
                 skillsNotes: str = "",
                 trasfondo: Optional[Dict[str, str]] = None,
                 inventoryNotes: str = "",
                 maxSalud: int = 0, maxSanity: int = 0, sanityLostThisSession: int = 0,
                 statuses: Optional[PlayerStatuses] = None,
                 pendingChecks: Optional[PendingChecks] = None):
        self.nombre = nombre
        self.personaje = personaje
        self.stats = stats if stats is not None else initial_stats.copy()
        #self.habilidades = {} # Not implemented
        self.skillsNotes = skillsNotes
        self.trasfondo = trasfondo if trasfondo is not None else {key: "" for key in TRASFONDO_KEYS}
        self.inventoryNotes = inventoryNotes
        self.maxSalud = maxSalud
        self.maxSanity = maxSanity
        self.sanityLostThisSession = sanityLostThisSession
        self.statuses = statuses if statuses is not None else PlayerStatuses()
        self.pendingChecks = pendingChecks if pendingChecks is not None else PendingChecks()

    def calculate_max_salud(self) -> int:
        con = self.stats.get("constitucion", initial_stats["constitucion"])
        tam = self.stats.get("tamaño", initial_stats["tamaño"])
        return max(1, (con + tam) // 10)

    def calculate_starting_cordura(self) -> int:
        return self.stats.get("poder", initial_stats["poder"])

    def calculate_max_sanity(self) -> int:
        mythos = self.stats.get("mythos", initial_stats["mythos"])
        return 99 - (mythos or 0)

# --- Initial State ---
initial_stats = {
    "fuerza": 50, "destreza": 50, "inteligencia": 50, "constitucion": 50, "poder": 50,
    "apariencia": 50, "educacion": 50, "tamaño": 50, "suerte": 50,
    "salud": 10, "cordura": 50, "mythos": 0,
}

initial_statuses = PlayerStatuses()
initial_pending_checks = PendingChecks()

# --- Helper Functions ---
def calculate_new_stat_value(current_value: int, modifier_input: str) -> Optional[int]:
    trimmed_input = modifier_input.strip()
    if not trimmed_input:
        return None

    operator = trimmed_input[0]
    operand_string = trimmed_input[1:]

    if operator in ["+", "-", "*", "/"]:
        if not operand_string:
            return None
        try:
            operand = float(operand_string)
        except ValueError:
            return None

        if operator == "+":
            return current_value + int(operand)
        elif operator == "-":
            return current_value - int(operand)
        elif operator == "*":
            return int(current_value * operand)
        elif operator == "/":
            if operand == 0:
                return None
            return int(current_value / operand)
    else:
        try:
            direct_value = int(trimmed_input)
            if str(direct_value) == trimmed_input:
                return direct_value
        except ValueError:
            pass

    return None


# --- Global Data ---
# --- Investigator Manager Class ---
class InvestigatorManager:
    def __init__(self, app, investigator_listbox):
        self.app = app
        self.investigator_listbox = investigator_listbox
        self.investigators: List[PlayerData] = []
        self.selected_player_index: Optional[int] = None
        self.next_player_number: int = 1


    def add_investigator(self) -> PlayerData:
        new_player = PlayerData(nombre=f"Jugador {self.next_player_number}",
                                personaje=f"Personaje {self.next_player_number}")
        new_player.maxSalud = new_player.calculate_max_salud()
        new_player.stats["salud"] = new_player.maxSalud
        new_player.stats["cordura"] = new_player.calculate_starting_cordura()
        new_player.maxSanity = new_player.calculate_max_sanity()

        self.investigators.append(new_player)
        self.investigator_listbox.insert(tk.END, f"{new_player.personaje} ({new_player.nombre})")
        self.next_player_number += 1
        return new_player

    def delete_investigator(self):
        if self.selected_player_index is not None and 0 <= self.selected_player_index < len(self.investigators):
            del self.investigators[self.selected_player_index]
            self.investigator_listbox.delete(self.selected_player_index)
            self.select_player(None)  # Clear selection and update UI
            if self.investigators:
                self.select_player(0)  # Select the first remaining investigator

    def handle_player_selection(self, event):
        try:
            index = self.investigator_listbox.curselection()[0]
            self.select_player(index)
        except IndexError:
            self.select_player(None)

    def select_player(self, index: Optional[int]):
        if index is None or not (0 <= index < len(self.investigators)):
            self.selected_player_index = None
        else:
            self.selected_player_index = index

        self.app.update_ui()

    def get_selected_player(self) -> Optional[PlayerData]:
        if self.selected_player_index is not None and 0 <= self.selected_player_index < len(self.investigators):
            return self.investigators[self.selected_player_index]
        return None

    # --- Data Handling ---
    def save_data(self, data_file: str):
        # Convert PlayerData objects to dictionaries, including nested objects
        def convert_to_dict(obj):
            if hasattr(obj, "__dict__"):
                return obj.__dict__
            return obj

        data = [
            {k: convert_to_dict(v) for k, v in investigator.__dict__.items()}
            for investigator in self.investigators
        ]

        try:
            with open(data_file, "w") as f:
                json.dump(data, f)
        except Exception as e:  # Broad exception handling for simplicity
            messagebox.showerror("Error Saving Data", f"An error occurred while saving data: {e}")

    def load_data(self, data_file: str):
        try:
            with open(data_file, "r") as f:
                data = json.load(f)
        except FileNotFoundError:
            return  # It's okay if the file doesn't exist yet
        except json.JSONDecodeError as e:
            messagebox.showerror("Error Loading Data", f"Invalid JSON format in data file: {e}")
            return
        except Exception as e:  # Catch other potential errors
            messagebox.showerror("Error Loading Data", f"An error occurred while loading data: {e}")
            return
        self.investigators = [PlayerData(**item) for item in data]


# --- UI Elements Class ---
class UIElements:
    def __init__(self, master, app):
        self.master = master
        self.app = app  # Reference to the main app
        self.stat_inputs: Dict[str, tk.Entry] = {}
        self.nombre_input: Optional[tk.Entry] = None
        self.personaje_input: Optional[tk.Entry] = None
        self.skills_text_area: Optional[tk.Text] = None
        self.inventory_text_area: Optional[tk.Text] = None

        self.create_stat_widgets(master)
        self.create_name_character_widgets(master)

    def create_stat_widgets(self, main_frame):
        # Stat Input Frame (Right Side)
        stat_frame = ttk.Frame(main_frame)
        stat_frame.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True)

        ttk.Label(stat_frame, text="Investigator Stats").grid(row=0, column=0, columnspan=2)

        row = 1
        col = 0
        for stat in initial_stats:
            ttk.Label(stat_frame, text=stat.capitalize() + ":").grid(row=row, column=col, sticky=tk.E, padx=5, pady=2)
            input_field = tk.Entry(stat_frame, width=10)
            input_field.grid(row=row, column=col + 1, sticky=tk.W, padx=5, pady=2)
            input_field.bind("<FocusOut>", self.app.handle_stat_input_blur)
            input_field.bind("<Return>", self.app.handle_stat_input_keydown)
            self.stat_inputs[stat] = input_field
            col += 2
            if col >= 4:  # Adjust the number of columns as needed
                col = 0
                row += 1
        
        # Notes Section (Skills and Inventory)
        notes_frame = ttk.Frame(stat_frame)
        notes_frame.grid(row=row, column=0, columnspan=4, sticky=tk.W, pady=10)

        ttk.Label(notes_frame, text="Skills Notes:").pack(anchor=tk.W)
        self.skills_text_area = tk.Text(notes_frame, width=40, height=5)
        self.skills_text_area.pack()

        ttk.Label(notes_frame, text="Inventory Notes:").pack(anchor=tk.W)
        self.inventory_text_area = tk.Text(notes_frame, width=40, height=5)
        self.inventory_text_area.pack()

    def create_name_character_widgets(self, main_frame):
        # Name and Character Frame (Above Stats)
        name_character_frame = ttk.Frame(main_frame)
        name_character_frame.pack(side=tk.TOP, fill=tk.X, expand=False)

        ttk.Label(name_character_frame, text="Nombre:").grid(row=0, column=0, sticky=tk.E, padx=5, pady=2)
        self.nombre_input = tk.Entry(name_character_frame, width=20)
        self.nombre_input.grid(row=0, column=1, sticky=tk.W, padx=5, pady=2)
        self.nombre_input.bind("<FocusOut>", lambda event: self.app.handle_field_change("nombre"))

        ttk.Label(name_character_frame, text="Personaje:").grid(row=0, column=2, sticky=tk.E, padx=5, pady=2)
        self.personaje_input = tk.Entry(name_character_frame, width=20)
        self.personaje_input.grid(row=0, column=3, sticky=tk.W, padx=5, pady=2)
        self.personaje_input.bind("<FocusOut>", lambda event: self.app.handle_field_change("personaje"))

    def update_field_inputs(self):
        if self.app.investigator_manager.selected_player_index is not None and 0 <= self.app.investigator_manager.selected_player_index < len(self.app.investigator_manager.investigators):
            player = self.app.investigator_manager.get_selected_player()
            if self.nombre_input:
                self.nombre_input.delete(0, tk.END)
                self.nombre_input.insert(0, player.nombre)
            if self.personaje_input:
                self.personaje_input.delete(0, tk.END)
                self.personaje_input.insert(0, player.personaje)

    def update_stat_inputs(self):
        if self.app.investigator_manager.selected_player_index is not None and 0 <= self.app.investigator_manager.selected_player_index < len(self.app.investigator_manager.investigators):
            player = self.app.investigator_manager.get_selected_player()
            for stat, input_field in self.stat_inputs.items():
                value = player.stats.get(stat, initial_stats.get(stat, 0))
                input_field.delete(0, tk.END)
                input_field.insert(0, str(value))
            self.update_notes_inputs()

    def update_notes_inputs(self):
        if self.app.investigator_manager.selected_player_index is not None and 0 <= self.app.investigator_manager.selected_player_index < len(self.app.investigator_manager.investigators):
            player = self.app.investigator_manager.get_selected_player()
            if self.skills_text_area:
                self.skills_text_area.delete("1.0", tk.END)  # Clear existing text
                if player.skillsNotes:
                    self.skills_text_area.insert(tk.END, player.skillsNotes)  # Insert new text
                self.skills_text_area.bind("<FocusOut>", lambda event: self.app.handle_skills_text_change())
            if self.inventory_text_area:
                self.inventory_text_area.delete("1.0", tk.END)
                if player.inventoryNotes:
                    self.inventory_text_area.insert(tk.END, player.inventoryNotes)
                self.inventory_text_area.bind("<FocusOut>", lambda event: self.app.handle_inventory_text_change())

    def handle_stat_input_change(self, event):
        player = self.app.investigator_manager.get_selected_player()
        if player:
            for stat, input_field in self.stat_inputs.items():
                if input_field is event.widget:
                    try:
                        new_value = int(input_field.get())
                        player.stats[stat] = new_value
                    except ValueError:
                        # Handle invalid input (e.g., non-integer)
                        pass
                    break

    def handle_stat_input_blur(self, event):
        self.handle_stat_input_change(event)

    def handle_stat_input_keydown(self, event):
        if event.keysym == "Return":
            self.handle_stat_input_change(event)
            self.master.focus_set()  # Remove focus from the input


# --- Application Class ---
class CthulhuTrackerApp:
    def __init__(self, master):
        self.master = master
        master.title("Cthulhu Investigator Tracker")

        self.bout_of_madness_result: Optional[str] = None
        self.is_bout_of_madness_alert_open: bool = False
        self.is_session_active: bool = False

        self.data_file: str = "investigator_data.json"
        self.create_widgets()        
        self.load_data()

    def create_widgets(self):
        self.notebook = ttk.Notebook(self.master)
        self.notebook.pack(fill=tk.BOTH, expand=True)

        # Main Frame
        main_frame = ttk.Frame(self.notebook, padding="10")
        self.notebook.add(main_frame, text="Investigators")
        main_frame.pack(fill=tk.BOTH, expand=True)
    
        # Panedwindow to allow resizing the investigator list and skills area
        paned = ttk.Panedwindow(main_frame, orient=tk.HORIZONTAL)
        paned.pack(fill=tk.BOTH, expand=True)

        # Investigator List Frame (Left Side)
        investigator_frame = ttk.Frame(paned)
        paned.add(investigator_frame, weight=1)

        ttk.Label(investigator_frame, text="Investigators").pack()
        self.investigator_listbox = tk.Listbox(investigator_frame, selectmode=tk.SINGLE)
        self.investigator_listbox.pack(fill=tk.BOTH, expand=True)
        self.investigator_listbox.bind('<<ListboxSelect>>', self.handle_investigator_selection)

        # Initialize Investigator Manager
        self.investigator_manager = InvestigatorManager(self, self.investigator_listbox)

        # Add/Delete Investigator Buttons
        button_frame = ttk.Frame(investigator_frame)
        button_frame.pack()
        ttk.Button(button_frame, text="Add", command=self.add_investigator).pack(side=tk.LEFT)
        ttk.Button(button_frame, text="Delete", command=self.delete_investigator).pack(side=tk.LEFT)

        # Initialize UI Elements (must be done after InvestigatorManager)
        self.ui_elements = UIElements(paned, self)

    def handle_investigator_selection(self, event):
        self.investigator_manager.handle_player_selection(event)

    def add_investigator(self) -> None:
        self.investigator_manager.add_investigator()
        self.update_ui()

    def delete_investigator(self) -> None:
        self.investigator_manager.delete_investigator()

    def update_ui(self):
        player = self.investigator_manager.get_selected_player()
        if player:
            self.ui_elements.update_field_inputs()
            self.ui_elements.update_stat_inputs()
        else:
            self.ui_elements.update_stat_inputs()
            self.ui_elements.update_field_inputs()
            self.ui_elements.update_notes_inputs()

    def handle_field_change(self, field: str):
        player = self.investigator_manager.get_selected_player()
        if player:
            if field == "nombre" and self.ui_elements.nombre_input:
                player.nombre = self.ui_elements.nombre_input.get()
            elif field == "personaje" and self.ui_elements.personaje_input:
                player.personaje = self.ui_elements.personaje_input.get()

    def handle_stat_input_change(self, event):
        self.ui_elements.handle_stat_input_change(event)

    def handle_stat_input_blur(self, event):
        self.ui_elements.handle_stat_input_blur(event)

    def handle_stat_input_keydown(self, event):
        self.ui_elements.handle_stat_input_keydown(event)

    def handle_skills_text_change(self):
        player = self.investigator_manager.get_selected_player()
        if player:
            if self.ui_elements.skills_text_area:
                player.skillsNotes = self.ui_elements.skills_text_area.get("1.0", tk.END).strip()

    def handle_inventory_text_change(self):
        player = self.investigator_manager.get_selected_player()
        if player:
            if self.ui_elements.inventory_text_area:
                player.inventoryNotes = self.ui_elements.inventory_text_area.get("1.0", tk.END).strip()




        
    # --- Global Data Handling ---
    def save_data(self):
        self.investigator_manager.save_data(self.data_file)

    def load_data(self):
        self.investigator_manager.load_data(self.data_file)

# --- Main App ---
root = tk.Tk()
app = CthulhuTrackerApp(root)

def on_close():
    app.save_data()
    root.destroy()

root.protocol("WM_DELETE_WINDOW", on_close)
root.mainloop()