import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { XCircle, AlertTriangle, CheckCircle, Play, Square, HeartPulse, Skull, HelpCircle, BrainCircuit, ChevronDown, ChevronRight, Archive, Swords, Loader2 } from 'lucide-react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Tooltip,
    TooltipProvider,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";


// --- Constants ---
const BOUTS_OF_MADNESS_REALTIME = [
    /* 1 */ "Amnesia: Olvida eventos recientes (1D10 asaltos).",
    /* 2 */ "Discapacidad Psicosomática: Ceguera, sordera, parálisis (1D10 asaltos).",
    /* 3 */ "Violencia: Ataca indiscriminadamente (1D10 asaltos).",
    /* 4 */ "Paranoia: Desconfianza extrema, todos conspiran (1D10 asaltos).",
    /* 5 */ "Persona Significativa: Confunde a alguien con figura clave de su Trasfondo (1D10 asaltos).",
    /* 6 */ "Desmayo: Inconsciente (1D10 asaltos).",
    /* 7 */ "Huir en Pánico: Corre sin control (1D10 asaltos).",
    /* 8 */ "Histeria/Explosión Emocional: Risa, llanto, gritos incontrolables (1D10 asaltos).",
    /* 9 */ "Fobia: Adquiere nueva fobia (Tira/Elige p.164), reacciona a ella (1D10 asaltos).",
    /* 10 */ "Manía: Adquiere nueva manía (Tira/Elige p.166), actúa según ella (1D10 asaltos).",
];

const TRASFONDO_KEYS = [
    "descripcion", "ideologia", "allegados", "lugares", "posesiones", "rasgos",
    "lesiones", "fobiasManias", "tomos", "encuentros"
];
const TRASFONDO_LABELS: Record<string, string> = {
    descripcion: "Descripción Personal", ideologia: "Ideología/Creencias", allegados: "Allegados",
    lugares: "Lugares Significativos", posesiones: "Posesiones Preciadas", rasgos: "Rasgos",
    lesiones: "Lesiones y Cicatrices", fobiasManias: "Fobias y Manías",
    tomos: "Tomos Arcanos, Hechizos, Artefactos", encuentros: "Encuentros con Entidades"
};


// --- Interfaces ---
interface PlayerStatuses {
    heridaGrave: boolean;
    inconsciente: boolean;
    locuraTemporal: boolean;
    locuraIndefinida: boolean;
    locuraSubyacente: boolean;
    moribundo: boolean;
    estabilizado: boolean;
    muerto: boolean;
}

interface PendingChecks {
    needsMajorWoundConCheck: boolean;
    needsTempInsanityIntCheck: boolean;
    needsIndefiniteInsanityConfirmation: boolean;
    needsDyingConCheck: boolean;
    needsSubyacenteConfirmation: boolean;
}

interface PlayerData {
    nombre: string;
    personaje: string;
    stats: Record<string, number>;
    habilidades: Record<string, number>; // Kept for potential future use or data conversion
    skillsNotes?: string; // <-- NEW: Free-form skills text
    trasfondo: Record<string, string>;
    inventoryNotes?: string; // <-- NEW: Free-form inventory text
    maxSalud: number;
    maxSanity: number;
    sanityLostThisSession: number;
    statuses: PlayerStatuses;
    pendingChecks: PendingChecks;
}

// --- Initial State ---
const initialStats = {
    fuerza: 50, destreza: 50, inteligencia: 50, constitucion: 50, poder: 50,
    apariencia: 50, educacion: 50, tamaño: 50, suerte: 50,
    salud: 10, cordura: 50, mythos: 0,
};

const initialStatuses: PlayerStatuses = {
    heridaGrave: false, inconsciente: false, locuraTemporal: false,
    locuraIndefinida: false, locuraSubyacente: false,
    moribundo: false, estabilizado: false, muerto: false,
};

const initialPendingChecks: PendingChecks = {
    needsMajorWoundConCheck: false, needsTempInsanityIntCheck: false,
    needsIndefiniteInsanityConfirmation: false, needsDyingConCheck: false,
    needsSubyacenteConfirmation: false,
};

const initialTrasfondo = TRASFONDO_KEYS.reduce((acc, key) => {
    acc[key] = "";
    return acc;
}, {} as Record<string, string>);

// --- Helper Functions ---
const calculateMaxSalud = (con: number, tam: number): number => Math.max(1, Math.floor((con + tam) / 10));
const calculateStartingCordura = (pow: number): number => pow;
const calculateMaxSanity = (mythos: number): number => 99 - (mythos || 0);

const calculateNewStatValue = (currentValue: number, modifierInput: string): number | null => {
    const trimmedInput = modifierInput.trim();
    if (trimmedInput === '') return null;
    const operator = trimmedInput.charAt(0);
    const operandString = trimmedInput.slice(1);

    if (['+', '-', '*', '/'].includes(operator)) {
        if (!operandString) return null;
        const operand = parseFloat(operandString);
        if (isNaN(operand)) return null;
        switch (operator) {
            case '+': return currentValue + Math.floor(operand);
            case '-': return currentValue - Math.floor(operand);
            case '*': return Math.floor(currentValue * operand);
            case '/': if (operand === 0) return null; return Math.floor(currentValue / operand);
            default: return null;
        }
    }
    const directValue = parseInt(trimmedInput, 10);
    if (!isNaN(directValue) && String(directValue) === trimmedInput) {
        return directValue;
    }
    return null;
};

// Debounce function
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}


// --- Component ---
const CthulhuTracker = () => {
    const [players, setPlayers] = useState<Record<string, PlayerData>>({});
    const [selectedPlayer, setSelectedPlayer] = useState<string>('');
    const [nextPlayerNumber, setNextPlayerNumber] = useState<number>(1);
    const [statInputs, setStatInputs] = useState<Record<string, string>>({});
    const [trasfondoInputs, setTrasfondoInputs] = useState<Record<string, Record<string, string>>>({});
    const [skillsText, setSkillsText] = useState<Record<string, string>>({});
    const [inventoryText, setInventoryText] = useState<Record<string, string>>({});
    const [isSkillsExpanded, setIsSkillsExpanded] = useState(false);
    const [isInventoryExpanded, setIsInventoryExpanded] = useState(false);
    const [boutOfMadnessResult, setBoutOfMadnessResult] = useState<string | null>(null);
    const [isBoutOfMadnessAlertOpen, setIsBoutOfMadnessAlertOpen] = useState(false);
    const [isSessionActive, setIsSessionActive] = useState(false);
    const [isSubyacenteAlertOpen, setIsSubyacenteAlertOpen] = useState(false);
    const [playerPendingSubyacente, setPlayerPendingSubyacente] = useState<string | null>(null);
    const [isSanityCheckModalOpen, setIsSanityCheckModalOpen] = useState<boolean>(false);
    const [sanityCheckSuccessLoss, setSanityCheckSuccessLoss] = useState<string>("");
    const [sanityCheckFailureLoss, setSanityCheckFailureLoss] = useState<string>("");
    const [sanityCheckRolls, setSanityCheckRolls] = useState<Record<string, string>>({});
        // Estados para la secuencia de actualización de cordura grupal
    const [isSanityUpdateSequenceActive, setIsSanityUpdateSequenceActive] = useState<boolean>(false);
    const [sequenceData, setSequenceData] = useState<Array<{ playerKey: string; personaje: string; roll: number; currentSanity: number; success: boolean; lossAmountString: string; }>>([]);
    const [currentSequenceIndex, setCurrentSequenceIndex] = useState<number>(0);
    const [currentSanityLossInput, setCurrentSanityLossInput] = useState<string>("");
    const [isConfirmingLoss, setIsConfirmingLoss] = useState<boolean>(false);
    const [currentSequencePauseReason, setCurrentSequencePauseReason] = useState<{ type: 'episode' | 'temp_int_check' | 'indef_confirm'; data: any; playerKey: string; } | null>(null);
    const isProcessingBlur = useRef<Record<string, boolean>>({});
    const initialLoadComplete = useRef<boolean>(false); // Ref to track initial load

    // --- Effects ---
    useEffect(() => {
        // --- Initial Load Logic ---
        const savedSessionState = localStorage.getItem('cthulhuSessionActive');
        setIsSessionActive(savedSessionState === 'true');
        const savedPlayers = localStorage.getItem('cthulhuPlayers');
        let loadedPlayers: Record<string, PlayerData> | null = null;

        if (savedPlayers) {
            try {
                const parsed = JSON.parse(savedPlayers);
                if (typeof parsed === 'object' && parsed !== null && Object.keys(parsed).length > 0) {
                    const firstKey = Object.keys(parsed)[0];
                    if (parsed[firstKey]?.stats &&
                        parsed[firstKey]?.statuses?.estabilizado !== undefined &&
                        parsed[firstKey]?.statuses?.locuraSubyacente !== undefined &&
                        parsed[firstKey]?.pendingChecks?.needsSubyacenteConfirmation !== undefined &&
                        parsed[firstKey]?.maxSanity !== undefined &&
                        parsed[firstKey]?.sanityLostThisSession !== undefined &&
                        parsed[firstKey]?.habilidades !== undefined &&
                        parsed[firstKey]?.skillsNotes !== undefined &&
                        parsed[firstKey]?.trasfondo !== undefined &&
                        parsed[firstKey]?.inventoryNotes !== undefined) {
                        loadedPlayers = parsed;
                    } else {
                        console.warn("Loaded player data missing fields. Resetting.");
                        localStorage.removeItem('cthulhuPlayers');
                    }
                }
            } catch (error) {
                console.error("Failed to parse players from localStorage:", error);
                localStorage.removeItem('cthulhuPlayers');
            }
        }

        if (loadedPlayers) {
            const updatedPlayers = Object.entries(loadedPlayers).reduce((acc, [key, playerData]) => {
                const con = playerData.stats.constitucion ?? initialStats.constitucion;
                const tam = playerData.stats.tamaño ?? initialStats.tamaño;
                const pow = playerData.stats.poder ?? initialStats.poder;
                const mythos = playerData.stats.mythos ?? initialStats.mythos;
                const maxHP = calculateMaxSalud(con, tam);
                const startSAN = calculateStartingCordura(pow);
                const maxSAN = calculateMaxSanity(mythos);
                const initialLoadStatuses = { ...initialStatuses, ...(playerData.statuses ?? {}) };
                const initialLoadPendingChecks = { ...initialPendingChecks, ...(playerData.pendingChecks ?? {}) };

                // Consolidate status/check cleanup logic
                 if (initialLoadStatuses.muerto) { initialLoadStatuses.inconsciente = true; initialLoadStatuses.moribundo = false; initialLoadStatuses.estabilizado = false; initialLoadStatuses.locuraTemporal = false; initialLoadStatuses.locuraIndefinida = false; initialLoadStatuses.locuraSubyacente = false; Object.keys(initialLoadPendingChecks).forEach(k => initialLoadPendingChecks[k as keyof PendingChecks] = false); }
                 else if (initialLoadStatuses.moribundo) { initialLoadStatuses.inconsciente = true; initialLoadStatuses.estabilizado = false; initialLoadPendingChecks.needsDyingConCheck = true; }
                 else if (initialLoadStatuses.estabilizado) { initialLoadStatuses.moribundo = false; initialLoadPendingChecks.needsDyingConCheck = false; }
                 else if (!initialLoadStatuses.inconsciente) { initialLoadStatuses.moribundo = false; initialLoadStatuses.estabilizado = false; initialLoadPendingChecks.needsDyingConCheck = false; }
                 if (initialLoadStatuses.locuraIndefinida) { initialLoadStatuses.locuraTemporal = false; initialLoadStatuses.locuraSubyacente = false; }
                 else if (initialLoadStatuses.locuraTemporal) { initialLoadStatuses.locuraSubyacente = false; }


                acc[key] = {
                    ...playerData,
                    stats: { ...initialStats, ...playerData.stats, salud: Math.min(playerData.stats.salud ?? maxHP, maxHP), cordura: Math.min(playerData.stats.cordura ?? startSAN, maxSAN) },
                    habilidades: playerData.habilidades ?? {}, skillsNotes: playerData.skillsNotes ?? "", trasfondo: { ...initialTrasfondo, ...(playerData.trasfondo ?? {}) }, inventoryNotes: playerData.inventoryNotes ?? "",
                    maxSalud: maxHP, maxSanity: maxSAN,
                    sanityLostThisSession: isSessionActive ? (playerData.sanityLostThisSession ?? 0) : 0, // Reset if session wasn't active
                    statuses: initialLoadStatuses, pendingChecks: initialLoadPendingChecks,
                };
                 Object.keys(acc[key].stats).forEach(statKey => { if (!(statKey in initialStats)) { delete acc[key].stats[statKey]; } });
                return acc;
            }, {} as Record<string, PlayerData>);

            setPlayers(updatedPlayers);
            const playerKeys = Object.keys(updatedPlayers);
            setSelectedPlayer(playerKeys.length > 0 ? playerKeys[0] : '');
            const maxNum = playerKeys.reduce((max, key) => { const match = key.match(/jugador(\d+)/); const num = match ? parseInt(match[1], 10) : 0; return Math.max(max, isNaN(num) ? 0 : num); }, 0);
            setNextPlayerNumber(maxNum + 1);
        } else {
            addDefaultPlayers();
            setNextPlayerNumber(6);
        }
        // Set flag after initial load logic is done
        initialLoadComplete.current = true;
    }, []); // Empty dependency array ensures this runs only once on mount

    const addDefaultPlayers = () => {
        const defaultPlayersData = Array.from({ length: 5 }, (_, i) => i + 1).reduce(
            (acc, num) => {
                const key = `jugador${num}`;
                const con = initialStats.constitucion; const tam = initialStats.tamaño; const pow = initialStats.poder; const mythos = initialStats.mythos;
                const maxHP = calculateMaxSalud(con, tam); const startSAN = calculateStartingCordura(pow); const maxSAN = calculateMaxSanity(mythos);
                acc[key] = {
                    nombre: `Jugador ${num}`, personaje: `Personaje ${num}`,
                    stats: { ...initialStats, salud: maxHP, cordura: startSAN },
                    habilidades: {}, skillsNotes: "", trasfondo: { ...initialTrasfondo }, inventoryNotes: "",
                    maxSalud: maxHP, maxSanity: maxSAN, sanityLostThisSession: 0,
                    statuses: { ...initialStatuses }, pendingChecks: { ...initialPendingChecks },
                };
                return acc;
            }, {} as Record<string, PlayerData>
        );
        setPlayers(defaultPlayersData);
        setSelectedPlayer('jugador1');
    };


    // --- Save to LocalStorage ---
    useEffect(() => {
        // Only save after initial load is complete to avoid overwriting potentially loaded data with defaults
        if (initialLoadComplete.current) {
            if (Object.keys(players).length > 0) {
                localStorage.setItem('cthulhuPlayers', JSON.stringify(players));
            } else {
                localStorage.removeItem('cthulhuPlayers');
            }
        }
    }, [players]);

    useEffect(() => {
        localStorage.setItem('cthulhuSessionActive', String(isSessionActive));
    }, [isSessionActive]);

    // --- Update Inputs/Textareas on Player Change ---
    useEffect(() => {
        if (selectedPlayer && players[selectedPlayer]) {
            const player = players[selectedPlayer];
            const currentStats = player.stats;
            const newInputs = Object.keys(initialStats).reduce((acc, statName) => {
                acc[statName] = String(currentStats[statName] ?? initialStats[statName as keyof typeof initialStats] ?? 0);
                return acc;
            }, {} as Record<string, string>);
             if (JSON.stringify(newInputs) !== JSON.stringify(statInputs)) { setStatInputs(newInputs); }
             setSkillsText(prev => ({ ...prev, [selectedPlayer]: player.skillsNotes ?? "" }));
             setInventoryText(prev => ({ ...prev, [selectedPlayer]: player.inventoryNotes ?? "" }));
             setTrasfondoInputs(prev => ({ ...prev, [selectedPlayer]: { ...initialTrasfondo, ...(player.trasfondo ?? {}) } }));
        } else if (Object.keys(statInputs).length > 0){
            setStatInputs({}); setSkillsText({}); setInventoryText({}); setTrasfondoInputs({});
        }
    }, [selectedPlayer, players]); // Depend only on players and selectedPlayer

    // --- Handlers ---

    const handleFieldChange = useCallback((playerKey: string, field: 'nombre' | 'personaje', value: string) => {
         if (players[playerKey]?.statuses.muerto) return;
        setPlayers(prev => ({ ...prev, [playerKey]: { ...prev[playerKey], [field]: value } }));
    }, [players]);

    const handleStatInputChange = useCallback((statName: string, value: string) => {
         if (players[selectedPlayer]?.statuses.muerto) return;
        setStatInputs(prev => ({ ...prev, [statName]: value }));
    }, [players, selectedPlayer]);

     const debouncedUpdatePlayerField = useCallback(debounce((playerKey: string, field: 'skillsNotes' | 'inventoryNotes' | `trasfondo.${string}`, value: string) => {
        setPlayers(prevPlayers => {
            const currentPlayerState = prevPlayers[playerKey];
            if (!currentPlayerState || currentPlayerState.statuses.muerto) return prevPlayers;
            if (field.startsWith('trasfondo.')) {
                const trasfondoKey = field.split('.')[1];
                return { ...prevPlayers, [playerKey]: { ...currentPlayerState, trasfondo: { ...currentPlayerState.trasfondo, [trasfondoKey]: value, }, }, };
            } else {
                return { ...prevPlayers, [playerKey]: { ...currentPlayerState, [field]: value, }, };
            }
        });
    }, 300), []); // Empty dependency array, function doesn't depend on external state changing over time

    const handleStatInputBlur = useCallback((statName: string) => {
        const playerKey = selectedPlayer;
        const inputId = `${playerKey}-${statName}`;
        if (isProcessingBlur.current[inputId]) { return; }
        isProcessingBlur.current[inputId] = true;

        if (!playerKey || !players[playerKey] || !(statName in players[playerKey].stats) || players[playerKey].statuses.muerto) {
             delete isProcessingBlur.current[inputId]; return;
        }

        const player = players[playerKey];
        const currentValue = player.stats[statName];
        const modifierInput = statInputs[statName] ?? String(currentValue);
        let newValue = calculateNewStatValue(currentValue, modifierInput);

        if (newValue !== null) {
            if (statName === 'salud') newValue = Math.min(newValue, player.maxSalud);
            else if (statName === 'cordura') newValue = Math.min(newValue, player.maxSanity);
            newValue = Math.max(0, newValue);
        }

        if (newValue !== null && newValue !== currentValue) {
            const actualNewValue = newValue;
            const delta = currentValue - actualNewValue; // Positive delta means loss

            setPlayers(prevPlayers => {
                const stateBeforeUpdate = prevPlayers[playerKey];
                if (!stateBeforeUpdate || stateBeforeUpdate.statuses.muerto) { return prevPlayers; }

                let nextStats = { ...stateBeforeUpdate.stats, [statName]: actualNewValue };
                let nextPendingChecks = { ...stateBeforeUpdate.pendingChecks };
                let nextStatuses = { ...stateBeforeUpdate.statuses };
                let nextMaxSalud = stateBeforeUpdate.maxSalud;
                let nextMaxSanity = stateBeforeUpdate.maxSanity;
                let sessionLossBeforeThisEvent = stateBeforeUpdate.sanityLostThisSession;
                let finalSessionLossToStore = sessionLossBeforeThisEvent;
                let shouldTriggerBout = false;

                const alerts: string[] = [];

                if (statName === 'constitucion' || statName === 'tamaño') {
                    nextMaxSalud = calculateMaxSalud(nextStats.constitucion, nextStats.tamaño);
                    if (nextStats.salud > nextMaxSalud) nextStats.salud = nextMaxSalud;
                }
                if (statName === 'mythos') {
                    nextMaxSanity = calculateMaxSanity(nextStats.mythos);
                    if (nextStats.cordura > nextMaxSanity) nextStats.cordura = nextMaxSanity;
                }

                if (isSessionActive && statName === 'salud' && delta > 0) {
                    if (delta >= nextMaxSalud) {
                         nextStatuses = { ...initialStatuses, muerto: true, inconsciente: true, heridaGrave: stateBeforeUpdate.statuses.heridaGrave };
                         nextPendingChecks = { ...initialPendingChecks };
                         alerts.push(`💀 ¡MUERTE INSTANTÁNEA! (${stateBeforeUpdate.personaje} perdió ${delta}/${nextMaxSalud} PV en un golpe). 💀`);
                         // Early return for instant death to prevent further checks
                         return { ...prevPlayers, [playerKey]: { ...stateBeforeUpdate, stats: nextStats, maxSalud: nextMaxSalud, maxSanity: nextMaxSanity, sanityLostThisSession: finalSessionLossToStore, statuses: nextStatuses, pendingChecks: nextPendingChecks } };
                    }
                    const majorWoundThreshold = nextMaxSalud / 2;
                    if (delta >= majorWoundThreshold && !nextStatuses.heridaGrave) {
                        nextStatuses.heridaGrave = true;
                        nextPendingChecks.needsMajorWoundConCheck = true;
                        alerts.push(`ALERTA (${stateBeforeUpdate.personaje}): HERIDA GRAVE (perdió ${delta}/${nextMaxSalud} PV).\n- Realiza tirada de CON vs ${nextStats.constitucion}. Si falla, quedará inconsciente.`);
                    }
                    if (actualNewValue <= 0 && !nextStatuses.moribundo && !nextStatuses.muerto) { // Don't trigger if already dead
                        if (nextStatuses.heridaGrave) {
                            nextStatuses.moribundo = true; nextStatuses.inconsciente = true; nextStatuses.estabilizado = false;
                            nextPendingChecks.needsDyingConCheck = true;
                            alerts.push(`ALERTA (${stateBeforeUpdate.personaje}): ¡MORIBUNDO! (0 PV con Herida Grave).\n- Realiza tirada de CON vs ${nextStats.constitucion} para evitar MUERTE.`);
                        } else {
                            nextStatuses.inconsciente = true;
                            alerts.push(`ALERTA (${stateBeforeUpdate.personaje}): INCONSCIENTE (0 PV sin Herida Grave).`);
                        }
                    }
                }

                if (isSessionActive && statName === 'cordura' && delta > 0 && !nextStatuses.muerto) { // Don't trigger sanity checks if dead
                    const updatedTotalSessionLoss = sessionLossBeforeThisEvent + delta;
                    const sanityBeforeThisEvent = currentValue;
                    const indefiniteThreshold = Math.floor(sanityBeforeThisEvent / 5);

                    // Check for Subyacente trigger FIRST
                    if (stateBeforeUpdate.statuses.locuraSubyacente && !nextStatuses.locuraTemporal && !nextStatuses.locuraIndefinida) {
                         shouldTriggerBout = true;
                         alerts.push(`ALERTA (${stateBeforeUpdate.personaje}): ¡NUEVO EPISODIO DE LOCURA! (Perdió ${delta} SAN mientras estaba en Locura Subyacente).`);
                    }
                    // Then check for Indefinite
                    else if (updatedTotalSessionLoss >= indefiniteThreshold && !nextStatuses.locuraIndefinida) {
                        if (nextStatuses.locuraTemporal) nextStatuses.locuraTemporal = false;
                        if (nextStatuses.locuraSubyacente) nextStatuses.locuraSubyacente = false;
                        nextPendingChecks.needsIndefiniteInsanityConfirmation = true;
                        alerts.push(`ALERTA (${stateBeforeUpdate.personaje}): ¡LOCURA INDEFINIDA DESENCADENADA! (Pérdida acumulada sesión: ${updatedTotalSessionLoss} >= ${indefiniteThreshold} (1/5 de ${sanityBeforeThisEvent} SAN)).\n- Confirma para marcar estado y activar Episodio de Locura.`);
                    }
                    // Finally check for Temporary (if not already Indefinite or Subyacente)
                    else if (delta >= 5 && !nextStatuses.locuraTemporal && !nextStatuses.locuraIndefinida && !nextStatuses.locuraSubyacente) {
                         if (nextStatuses.locuraSubyacente) nextStatuses.locuraSubyacente = false; // Clear subyacente if temp triggers
                        nextPendingChecks.needsTempInsanityIntCheck = true;
                        alerts.push(`ALERTA (${stateBeforeUpdate.personaje}): Posible LOCURA TEMPORAL (Perdió ${delta} SAN en un evento >= 5).\n- Realiza tirada de INT vs ${nextStats.inteligencia}. Si la supera, ¡locura!`);
                    }
                    finalSessionLossToStore = updatedTotalSessionLoss;
                }


                if (alerts.length > 0) { setTimeout(() => alert(alerts.join('\n\n---\n')), 0); }

                if (shouldTriggerBout) {
                     const insanityTypeForBout: 'locuraTemporal' | 'locuraIndefinida' | 'locuraSubyacente' =
                        nextStatuses.locuraIndefinida ? 'locuraIndefinida' :
                        nextStatuses.locuraTemporal ? 'locuraTemporal' :
                        'locuraSubyacente'; // Default to subyacente if that was the trigger
                    setTimeout(() => triggerBoutOfMadness(playerKey, insanityTypeForBout), 10);
                }


                return {
                    ...prevPlayers,
                    [playerKey]: {
                        ...stateBeforeUpdate,
                        stats: nextStats,
                        maxSalud: nextMaxSalud,
                        maxSanity: nextMaxSanity,
                        sanityLostThisSession: finalSessionLossToStore,
                        statuses: nextStatuses,
                        pendingChecks: nextPendingChecks,
                    },
                };
            });

             setStatInputs(prev => ({ ...prev, [statName]: String(actualNewValue) }));

        } else if (modifierInput !== String(currentValue)) {
            setStatInputs(prev => ({ ...prev, [statName]: String(currentValue) }));
            if (newValue === null) { console.warn(`Invalid modifier input for ${statName}: "${modifierInput}". Resetting.`); }
        }

        setTimeout(() => { delete isProcessingBlur.current[inputId]; }, 50);
    }, [selectedPlayer, players, statInputs, isSessionActive]);

    const handleStatInputKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>, statName: string) => {
        if (event.key === 'Enter') { handleStatInputBlur(statName); event.currentTarget.blur(); }
     }, [handleStatInputBlur]);

    const handleAddPlayer = useCallback(() => {
        const newPlayerKey = `jugador${nextPlayerNumber}`;
        const con = initialStats.constitucion; const tam = initialStats.tamaño; const pow = initialStats.poder; const mythos = initialStats.mythos;
        const maxHP = calculateMaxSalud(con, tam); const startSAN = calculateStartingCordura(pow); const maxSAN = calculateMaxSanity(mythos);
        setPlayers(prev => ({
            ...prev,
            [newPlayerKey]: {
                nombre: `Jugador ${nextPlayerNumber}`, personaje: `Personaje ${nextPlayerNumber}`,
                stats: { ...initialStats, salud: maxHP, cordura: startSAN },
                habilidades: {}, skillsNotes: "", trasfondo: { ...initialTrasfondo }, inventoryNotes: "",
                maxSalud: maxHP, maxSanity: maxSAN, sanityLostThisSession: 0,
                statuses: { ...initialStatuses }, pendingChecks: { ...initialPendingChecks },
            },
        }));
        setSelectedPlayer(newPlayerKey);
        setNextPlayerNumber(prev => prev + 1);
    }, [nextPlayerNumber]);

    const confirmStatusUpdate = (playerKey: string, statusToSet: keyof PlayerStatuses, pendingCheckToClear: keyof PendingChecks | null, statusValue: boolean = true) => {
        let shouldTriggerBout = false;
        setPlayers(prevPlayers => {
            const player = prevPlayers[playerKey];
            if (!player || (player.statuses.muerto && statusToSet !== 'muerto')) return prevPlayers;
            const currentStatuses = player.statuses;
            const currentPendingChecks = player.pendingChecks;

            let newStatuses = { ...currentStatuses, [statusToSet]: statusValue };
            let newPendingChecks = pendingCheckToClear ? { ...currentPendingChecks, [pendingCheckToClear]: false, } : { ...currentPendingChecks };

             // Handle complex status interactions
             if (statusToSet === 'muerto' && statusValue) { newStatuses = { ...initialStatuses, muerto: true, inconsciente: true, heridaGrave: currentStatuses.heridaGrave }; newPendingChecks = { ...initialPendingChecks }; }
             else if (statusToSet === 'moribundo' && statusValue) { newStatuses.inconsciente = true; newStatuses.estabilizado = false; newPendingChecks.needsDyingConCheck = true; }
             else if (statusToSet === 'estabilizado' && statusValue) { newStatuses.moribundo = false; newPendingChecks.needsDyingConCheck = false; }
             else if (statusToSet === 'inconsciente' && !statusValue && !currentStatuses.muerto) { newStatuses.moribundo = false; newStatuses.estabilizado = false; newPendingChecks.needsDyingConCheck = false; }
             // Insanity Exclusivity & Bout Triggering
             else if (statusToSet === 'locuraIndefinida' && statusValue) { newStatuses.locuraTemporal = false; newStatuses.locuraSubyacente = false; if (!currentStatuses.locuraIndefinida) {shouldTriggerBout = true;} }
             else if (statusToSet === 'locuraTemporal' && statusValue) { newStatuses.locuraIndefinida = false; newStatuses.locuraSubyacente = false; if (!currentStatuses.locuraTemporal) {shouldTriggerBout = true;} }
             else if (statusToSet === 'locuraSubyacente' && statusValue) { newStatuses.locuraIndefinida = false; newStatuses.locuraTemporal = false; }

            // Clear associated pending checks when status is set
            if (statusToSet === 'heridaGrave' && statusValue) newPendingChecks.needsMajorWoundConCheck = false;
            if (statusToSet === 'locuraTemporal' && statusValue) newPendingChecks.needsTempInsanityIntCheck = false;
            if (statusToSet === 'locuraIndefinida' && statusValue) newPendingChecks.needsIndefiniteInsanityConfirmation = false;

            // Clear pending checks if status is being *cleared* (set to false)
             const statusToClear = statusToSet; // Rename for clarity
             if (!statusValue) {
                 if (statusToClear === 'moribundo') newPendingChecks.needsDyingConCheck = false;
                 if (statusToClear === 'heridaGrave') newPendingChecks.needsMajorWoundConCheck = false;
                 if (statusToClear === 'locuraIndefinida') newPendingChecks.needsIndefiniteInsanityConfirmation = false;
                 if (statusToClear === 'locuraSubyacente') { /* No specific check */ }
                 if (statusToClear === 'locuraTemporal') {
                     newPendingChecks.needsSubyacenteConfirmation = true;
                     newStatuses.locuraTemporal = true; // Keep it true until confirmation
                 }
             }

            return { ...prevPlayers, [playerKey]: { ...player, statuses: newStatuses, pendingChecks: newPendingChecks } };
        });

        if (shouldTriggerBout) {
             const insanityTypeForBout: 'locuraTemporal' | 'locuraIndefinida' | 'locuraSubyacente' =
                 players[playerKey].statuses.locuraIndefinida ? 'locuraIndefinida' :
                 players[playerKey].statuses.locuraTemporal ? 'locuraTemporal' :
                 'locuraSubyacente'; // Default to subyacente if that was the trigger
             setTimeout(() => triggerBoutOfMadness(playerKey, insanityTypeForBout), 10);
        }
        if (statusToSet === 'locuraTemporal' && !statusValue) {
             setPlayerPendingSubyacente(playerKey);
             setIsSubyacenteAlertOpen(true);
        }
     };


    const handleMajorWoundConCheckResult = (playerKey: string, passed: boolean) => {
        const player = players[playerKey]; if (!player || player.statuses.muerto) return;
        // Set heridaGrave to true first, then handle consciousness
        setPlayers(prev => ({...prev, [playerKey]: {...prev[playerKey], statuses: {...prev[playerKey].statuses, heridaGrave: true}, pendingChecks: {...prev[playerKey].pendingChecks, needsMajorWoundConCheck: false} }}));
        if (passed) {
             alert(`${player.personaje} superó CON. Permanece consciente, pero tiene Herida Grave.`);
             if (player.stats.salud <= 0) { confirmStatusUpdate(playerKey, 'moribundo', null, true); alert(`${player.personaje} está MORIBUNDO (0 PV con Herida Grave).\n- ¡Necesita Primeros Auxilios para estabilizar y Tirada CON vs ${player.stats.constitucion} para evitar MUERTE!`); }
        } else {
             confirmStatusUpdate(playerKey, 'inconsciente', null, true);
             alert(`${player.personaje} falló CON. ¡Queda INCONSCIENTE y tiene Herida Grave!`);
             if (player.stats.salud <= 0) {
                // If already at 0 HP when failing CON check, they become moribundo *in addition* to unconscious
                confirmStatusUpdate(playerKey, 'moribundo', null, true);
                alert(`${player.personaje} también está MORIBUNDO.\n- ¡Necesita Primeros Auxilios para estabilizar y Tirada CON vs ${player.stats.constitucion} para evitar MUERTE!`);
            }
        }
     };
     const handleTempInsanityIntCheckResult = (playerKey: string, passedIntCheck: boolean) => {
         const player = players[playerKey]; if (!player || player.statuses.muerto) return;
         if (passedIntCheck) { confirmStatusUpdate(playerKey, 'locuraTemporal', 'needsTempInsanityIntCheck', true); /* Alert handled by confirmStatusUpdate */ }
         else { setPlayers(prev => ({...prev, [playerKey]: {...prev[playerKey], pendingChecks: {...prev[playerKey].pendingChecks, needsTempInsanityIntCheck: false}}})); alert(`${player.personaje} falló INT. Reprime el horror.`); }
     };
     const confirmIndefiniteInsanity = (playerKey: string) => {
          const player = players[playerKey]; if (!player || player.statuses.muerto) return;
          confirmStatusUpdate(playerKey, 'locuraIndefinida', 'needsIndefiniteInsanityConfirmation', true); /* Alert handled by confirmStatusUpdate */
     };
     const handleDyingConCheckResult = (playerKey: string, passed: boolean) => {
         const player = players[playerKey]; if (!player || !player.statuses.moribundo || player.statuses.muerto) return;
         if (passed) {
             // Clear the *need* for the check, but don't clear the status itself yet
             setPlayers(prev => ({...prev, [playerKey]: {...prev[playerKey], pendingChecks: {...prev[playerKey].pendingChecks, needsDyingConCheck: false}}}));
             alert(`${player.personaje} superó CON. ¡Sobrevive... por ahora! Sigue Moribundo. Requiere otra tirada pronto.`);
             // Re-set the need for the check after a short delay if still moribundo/unstabilized
             setTimeout(() => {
                 setPlayers(prev => {
                     const current = prev[playerKey];
                     // Only re-set if still moribundo and NOT stabilized or dead
                     if (current && current.statuses.moribundo && !current.statuses.estabilizado && !current.statuses.muerto) {
                         return {...prev, [playerKey]: {...current, pendingChecks: {...current.pendingChecks, needsDyingConCheck: true}}};
                     }
                     return prev; // No change if status changed in the meantime
                 });
             }, 50); // Short delay to allow other updates
         } else { confirmStatusUpdate(playerKey, 'muerto', 'needsDyingConCheck', true); alert(`💀 ${player.personaje} falló CON. ¡Ha MUERTO! 💀`); }
     };
     const handleStabilize = (playerKey: string) => {
         const player = players[playerKey]; if (!player || !player.statuses.moribundo || player.statuses.muerto) return;
         confirmStatusUpdate(playerKey, 'estabilizado', 'needsDyingConCheck', true);
         // Set HP to 1 if it was 0 or less
         setPlayers(prev => ({ ...prev, [playerKey]: { ...prev[playerKey], stats: { ...prev[playerKey].stats, salud: Math.max(1, prev[playerKey].stats.salud) } } }));
         alert(`${player.personaje} ha sido ESTABILIZADO (+1 PV temporal mínimo). Necesita Medicina. Podría desestabilizarse.`);
     };
     const handleDestabilize = (playerKey: string) => {
          const player = players[playerKey]; if (!player || !player.statuses.estabilizado || player.statuses.muerto) return;
          // Setting stabilized to false and moribundo to true
          confirmStatusUpdate(playerKey, 'estabilizado', null, false);
          confirmStatusUpdate(playerKey, 'moribundo', null, true);
          setPlayers(prev => ({ ...prev, [playerKey]: { ...prev[playerKey], stats: { ...prev[playerKey].stats, salud: 0 } } }));
          alert(`${player.personaje} ha perdido la estabilización. ¡Vuelve a estar MORIBUNDO!\n- ¡Tirada CON vs ${player.stats.constitucion} requerida para evitar MUERTE!`);
     };

     const handleClearStatus = useCallback((playerKey: string, statusToClear: keyof PlayerStatuses) => {
        if (statusToClear === 'locuraTemporal') {
            setPlayerPendingSubyacente(playerKey);
            setIsSubyacenteAlertOpen(true);
        } else {
            confirmStatusUpdate(playerKey, statusToClear, null, false);
        }
     }, []);

     const confirmSubyacente = (activate: boolean) => {
         if (!playerPendingSubyacente) return;
         const playerKey = playerPendingSubyacente;
         setPlayers(prev => {
             const player = prev[playerKey]; if (!player) return prev;
             const newStatuses = { ...player.statuses, locuraTemporal: false, locuraSubyacente: activate };
             const newPendingChecks = { ...player.pendingChecks, needsTempInsanityIntCheck: false, needsSubyacenteConfirmation: false };
             return { ...prev, [playerKey]: { ...player, statuses: newStatuses, pendingChecks: newPendingChecks } };
         });
         setIsSubyacenteAlertOpen(false);
         setPlayerPendingSubyacente(null);
         alert(activate ? `${players[playerKey].personaje} entra en Locura Subyacente.` : `${players[playerKey].personaje} se recupera de la Locura Temporal.`);
     };

     const triggerBoutOfMadness = (playerKey: string, insanityType: 'locuraTemporal' | 'locuraIndefinida' | 'locuraSubyacente') => {
        const player = players[playerKey]; if (!player || player.statuses.muerto) return; // Retorna undefined si no aplica
        const roll = Math.floor(Math.random() * 10); const resultText = BOUTS_OF_MADNESS_REALTIME[roll];
        let duration = '';
         if (insanityType === 'locuraTemporal') duration = '1D10 horas';
         else if (insanityType === 'locuraIndefinida') duration = 'meses (hasta curación)';
         else if (insanityType === 'locuraSubyacente') duration = 'hasta curación (Indef.) o fin (Temp.)';

        // Construir el texto completo del episodio
        const boutText = `¡Episodio de Locura para ${player.personaje}!\n\nResultado (1D10 = ${roll + 1}): ${resultText}\n\n(${insanityType === 'locuraTemporal' ? 'Locura Temporal' : insanityType === 'locuraIndefinida' ? 'Locura Indefinida' : 'Locura Subyacente'} - Duración estado subyacente: ${duration})`;

        // Quitar la activación directa del alert global desde aquí (se manejará diferente en la secuencia)
        // setBoutOfMadnessResult(boutText);
        // setIsBoutOfMadnessAlertOpen(true);

        return boutText; // Devolver el texto generado
     };

     const handleProcessSanityCheckInputs = () => {
        console.log("Procesando Chequeo de Cordura:");
        console.log("Pérdida Éxito:", sanityCheckSuccessLoss);
        console.log("Pérdida Fallo:", sanityCheckFailureLoss);
        console.log("Resultados Tiradas:", sanityCheckRolls);
        
        const activePlayers = Object.entries(players)
        .filter(([/*key*/, player]) => !player.statuses.muerto); // Obtener jugadores activos

    console.log("Jugadores activos para el chequeo:", activePlayers.map(([key]) => key)); // Opcional: Mostrar llaves

    const updateSequence: { playerKey: string; personaje: string; roll: number; currentSanity: number; success: boolean; lossAmountString: string; }[] = [];

    activePlayers.forEach(([playerKey, playerData]) => {
        const rollString = sanityCheckRolls[playerKey] ?? ''; // Obtener string de tirada
        const roll = parseInt(rollString, 10); // Convertir a número
        const currentSanity = playerData.stats.cordura; // Obtener cordura actual

        if (!isNaN(roll) && roll >= 1 && roll <= 100) { // Validar tirada
            const success = roll <= currentSanity;
            const lossAmountString = success ? sanityCheckSuccessLoss : sanityCheckFailureLoss;
            const resultText = success ? 'ÉXITO' : 'FALLO';

            console.log(`-> ${playerData.personaje}: Tiró ${roll} vs ${currentSanity} SAN = ${resultText}. Pérdida: ${lossAmountString || 'N/A'}`);

            // Añadir al array para la secuencia de actualización
            updateSequence.push({
                playerKey,
                personaje: playerData.personaje,
                roll,
                currentSanity,
                success,
                lossAmountString: lossAmountString || '0', // Usar '0' si está vacío
            });

        } else {
             console.warn(`-> ${playerData.personaje}: Tirada inválida o no ingresada ('${rollString}'). Se omite.`); // Cambiado a warn
        }
    });

    console.log("Secuencia de actualización preparada:", updateSequence);

    if (updateSequence.length > 0) {
        setSequenceData(updateSequence);
        setCurrentSequenceIndex(0);
        setCurrentSanityLossInput(""); // Limpiar input para el primer jugador
        setIsSanityUpdateSequenceActive(true); // ¡Activar la secuencia!
        // Podríamos seleccionar al primer jugador aquí, pero lo haremos al mostrar el UI de secuencia
        setSelectedPlayer(updateSequence[0].playerKey);
        console.log(`Iniciando secuencia de actualización para ${updateSequence.length} jugadores.`);
    } else {
        console.log("No hay jugadores válidos para iniciar la secuencia de actualización.");
    }

        // TODO: Implementar lógica de comparación y secuencia de actualización
                // Resetear campos del modal inicial independientemente de si la secuencia inicia
                setSanityCheckSuccessLoss("");
                setSanityCheckFailureLoss("");
                setSanityCheckRolls({});
        setIsSanityCheckModalOpen(false); // Cerrar el modal
        // Opcional: Resetear inputs aquí o al reabrir? Por ahora, no reseteamos.
        // setSanityCheckSuccessLoss("");
        // setSanityCheckFailureLoss("");
        // setSanityCheckRolls({});
    };

    const handleConfirmSanityLoss = () => {
        if (!isSanityUpdateSequenceActive || sequenceData.length === 0 || currentSequenceIndex >= sequenceData.length) {
            console.error("Intento de confirmar pérdida fuera de secuencia válida.");
            setIsSanityUpdateSequenceActive(false); // Detener secuencia por seguridad
            return;
        }
        try {
        setIsConfirmingLoss(true); // Iniciar estado de carga
        const currentStep = sequenceData[currentSequenceIndex];
        const lossAmount = parseInt(currentSanityLossInput, 10);

        if (isNaN(lossAmount) || lossAmount < 0) {
            alert(`Por favor, introduce una pérdida de cordura válida (número entero >= 0).`);
            return; // No continuar si el input es inválido
        }

        console.log(`Procesando: ${currentStep.personaje} pierde ${lossAmount} SAN (Input: '${currentSanityLossInput}')`)
        const playerKey = currentStep.playerKey;
        const playerData = players[playerKey]; // Obtener datos actuales del jugador

        if (!playerData) {
            console.error(`Error: No se encontraron datos para el jugador ${playerKey} durante la actualización.`);
            setIsSanityUpdateSequenceActive(false); // Detener secuencia por seguridad
            return;
        }

        const currentSanityActual = playerData.stats.cordura; // Cordura antes de esta pérdida
        const newSanity = Math.max(0, currentSanityActual - lossAmount); // Calcular nueva cordura (mínimo 0)

        console.log(`   Cordura: ${currentSanityActual} -> ${newSanity} (Perdió ${lossAmount})`);
        let detectedPauseReason: typeof currentSequencePauseReason = null; // Variable para guardar razón de pausa
                    // Actualizar estado players (solo la resta directa por ahora)
                            // Actualizar estado players y realizar chequeos
                // Actualizar estado players y detectar pausas/chequeos
                setPlayers(prevPlayers => {
                    const updatedPlayerData = JSON.parse(JSON.stringify(prevPlayers[playerKey]));
                    updatedPlayerData.stats.cordura = newSanity;
        
                    let newPendingChecks = { ...updatedPlayerData.pendingChecks };
                    let newStatuses = { ...updatedPlayerData.statuses };
                    let sessionLoss = updatedPlayerData.sanityLostThisSession || 0;
                    let pauseReasonDetectedLocally: typeof currentSequencePauseReason = null; // Para uso dentro del callback
        
                    if (isSessionActive && lossAmount > 0 && !newStatuses.muerto) {
                        sessionLoss += lossAmount;
                        updatedPlayerData.sanityLostThisSession = sessionLoss;
        
                        // --- Chequeos con Pausa (Priorizados) ---
                        let existingInsanityType: 'locuraTemporal' | 'locuraIndefinida' | 'locuraSubyacente' | null = null;
                        if (newStatuses.locuraIndefinida) existingInsanityType = 'locuraIndefinida';
                        else if (newStatuses.locuraTemporal) existingInsanityType = 'locuraTemporal';
                        else if (newStatuses.locuraSubyacente) existingInsanityType = 'locuraSubyacente';
        
                        // 1. Episodio por pérdida durante locura existente
                        if (existingInsanityType) {
                            const triggeredText = triggerBoutOfMadness(playerKey, existingInsanityType);
                            if (triggeredText) {
                                pauseReasonDetectedLocally = { type: 'episode', data: { boutText: triggeredText }, playerKey };
                                // Limpiar checks pendientes si el episodio es directo
                                newPendingChecks.needsTempInsanityIntCheck = false;
                                newPendingChecks.needsIndefiniteInsanityConfirmation = false;
                                newPendingChecks.needsSubyacenteConfirmation = false;
                            }
                        }
        
                        // 2. Locura Indefinida (si no hubo episodio)
                        if (!pauseReasonDetectedLocally) {
                            const indefiniteThreshold = Math.floor(currentSanityActual / 5);
                            if (sessionLoss >= indefiniteThreshold && !newStatuses.locuraIndefinida) {
                                if (newStatuses.locuraTemporal) { newStatuses.locuraTemporal = false; newPendingChecks.needsTempInsanityIntCheck = false; }
                                if (newStatuses.locuraSubyacente) { newStatuses.locuraSubyacente = false; }
                                pauseReasonDetectedLocally = { type: 'indef_confirm', data: { threshold: indefiniteThreshold, sessionLoss: sessionLoss, sanityBefore: currentSanityActual }, playerKey };
                                newPendingChecks.needsIndefiniteInsanityConfirmation = true; // Mantener por si acaso
                                 newPendingChecks.needsTempInsanityIntCheck = false; // Indefinida anula check temporal
                            }
                        }
        
                        // 3. Locura Temporal (si no hubo episodio NI indefinida)
                        if (!pauseReasonDetectedLocally) {
                             if (lossAmount >= 5 && !newStatuses.locuraIndefinida && !newStatuses.locuraTemporal && !newStatuses.locuraSubyacente) {
                                 pauseReasonDetectedLocally = { type: 'temp_int_check', data: { intelligence: updatedPlayerData.stats.inteligencia, lossAmount: lossAmount }, playerKey };
                                 newPendingChecks.needsTempInsanityIntCheck = true; // Mantener por si acaso
                             }
                        }
                    } // Fin if (isSessionActive...)
        
                    updatedPlayerData.pendingChecks = newPendingChecks;
                    updatedPlayerData.statuses = newStatuses; // Actualizar statuses modificados (ej: si indefinida limpió temporal)
        
                     // Pasar la razón detectada a la variable externa
                     detectedPauseReason = pauseReasonDetectedLocally;
        
                    return {
                        ...prevPlayers,
                        [playerKey]: updatedPlayerData
                    };
                }); // Fin de setPlayers

            const advanceOrEndSequence = (currentPlayerKey: string) => {
        // Lógica movida desde handleConfirmSanityLoss
         setCurrentSanityLossInput(""); // Limpiar input para la próxima

         if (currentSequenceIndex >= sequenceData.length - 1) {
             // Era el último jugador
             console.log("Secuencia de actualización de cordura completada.");
             setIsSanityUpdateSequenceActive(false);
             setCurrentSequenceIndex(0);
             setSequenceData([]);
             setSelectedPlayer(currentPlayerKey); // Usar la key pasada como argumento
         } else {
             // Pasar al siguiente jugador
             const nextIndex = currentSequenceIndex + 1;
             console.log(`Avanzando al siguiente jugador: ${sequenceData[nextIndex].personaje} (Índice ${nextIndex})`);
             setCurrentSequenceIndex(nextIndex);
             setSelectedPlayer(sequenceData[nextIndex].playerKey);
         }
    };

    
        // TODO: Limpiar currentSanityLossInput
        // Aquí irá la lógica de validación, actualización y avance
    };

    // --- Corrected Session Toggle Logic ---
    const handleToggleSession = () => {
        setIsSessionActive(prev => !prev); // Just toggle the state
    };

    // Effect to react to session state change
    useEffect(() => {
        // Prevent running on initial mount before players are loaded
        if (!initialLoadComplete.current) return;

        // Update player states based on the *new* session state
        setPlayers(currentPlayers => {
            const updatedPlayers = { ...currentPlayers };
            let stateChanged = false;

            Object.keys(updatedPlayers).forEach(pKey => {
                const player = updatedPlayers[pKey];
                let playerChanged = false;
                let newPlayerData = { ...player };

                // Always reset sanityLostThisSession when session starts or ends
                if (newPlayerData.sanityLostThisSession !== 0) {
                    newPlayerData.sanityLostThisSession = 0;
                    playerChanged = true;
                }

                // Only reset pending checks if the session is NOW ending
                if (!isSessionActive) {
                    if (Object.values(newPlayerData.pendingChecks).some(check => check)) {
                        newPlayerData.pendingChecks = { ...initialPendingChecks };
                        playerChanged = true;
                    }
                }

                if (playerChanged) {
                    updatedPlayers[pKey] = newPlayerData;
                    stateChanged = true;
                }
            });

            return stateChanged ? updatedPlayers : currentPlayers;
        });

        // Display alert *after* state logic
        if (isSessionActive) {
            alert("Sesión iniciada. ¡El horror comienza!");
        } else {
            alert("Sesión terminada. Chequeos pendientes y pérdida de SAN acumulada reiniciados.");
        }

    }, [isSessionActive]); // Depend only on isSessionActive


    // --- Textarea Handlers ---
    const handleSkillsTextChange = useCallback((playerKey: string, value: string) => {
         if (players[playerKey]?.statuses.muerto) return;
         setSkillsText(prev => ({ ...prev, [playerKey]: value }));
         debouncedUpdatePlayerField(playerKey, 'skillsNotes', value);
     }, [players, debouncedUpdatePlayerField]);

     const handleInventoryTextChange = useCallback((playerKey: string, value: string) => {
         if (players[playerKey]?.statuses.muerto) return;
         setInventoryText(prev => ({ ...prev, [playerKey]: value }));
         debouncedUpdatePlayerField(playerKey, 'inventoryNotes', value);
     }, [players, debouncedUpdatePlayerField]);

     const handleTrasfondoChange = useCallback((playerKey: string, trasfondoKey: string, value: string) => {
        if (players[playerKey]?.statuses.muerto) return;
         setTrasfondoInputs(prev => ({
             ...prev,
             [playerKey]: {
                 ...(prev[playerKey] ?? {}),
                 [trasfondoKey]: value,
             }
         }));
         debouncedUpdatePlayerField(playerKey, `trasfondo.${trasfondoKey}`, value);
     }, [players, debouncedUpdatePlayerField]);


    // --- Render ---
    const currentPlayer = selectedPlayer ? players[selectedPlayer] : null;
    const orderedStatNames = Object.keys(initialStats);

    return (
         <TooltipProvider delayDuration={100}>
             <div className="container mx-auto p-4 bg-gray-900 text-gray-100 min-h-screen">
                 {/* Header and Session Toggle */}
                 <div className="flex justify-between items-center mb-6">
                      <h1 className="text-3xl font-bold text-red-600 tracking-wider" style={{ fontFamily: "'Metamorphous', cursive" }}> CTHULHU TRACKER </h1>
                      <Button onClick={handleToggleSession} variant="outline" className={cn("border-2 px-4 py-2 rounded-md flex items-center gap-2 transition-colors duration-200", isSessionActive ? "bg-red-900/80 border-red-600 hover:bg-red-800 text-red-100" : "bg-green-900/80 border-green-600 hover:bg-green-800 text-green-100")}>
                         {isSessionActive ? <Square size={16} /> : <Play size={16} />} {isSessionActive ? 'Terminar Sesión' : 'Iniciar Sesión'}
                      </Button>
                      <Button
                         onClick={() => setIsSanityCheckModalOpen(true)}
                         variant="outline"
                         className={cn(
                             "border-2 px-4 py-2 rounded-md flex items-center gap-2 transition-colors duration-200 border-blue-600 hover:bg-blue-900/50 text-blue-100",
                             (!isSessionActive || Object.keys(players).length === 0) && "opacity-50 cursor-not-allowed"
                         )}
                         disabled={!isSessionActive || Object.keys(players).length === 0}
                         title="Iniciar un chequeo de cordura para todos los investigadores activos"
                     >
                         <BrainCircuit size={16} /> Chequeo Cordura Grupal
                     </Button>
                 </div>

                 {/* Player Selection and Add Button */}
                 <div className="mb-6 flex flex-col sm:flex-row items-center justify-center gap-4">
                     <Select onValueChange={setSelectedPlayer} value={selectedPlayer}>
                         <SelectTrigger className="w-full sm:w-64 bg-gray-800 border-gray-700 text-gray-100 ring-offset-gray-900 focus:ring-red-600">
                             <SelectValue placeholder="Seleccionar Investigador..." />
                         </SelectTrigger>
                         <SelectContent className="bg-gray-800 border-gray-700 text-gray-100">
                             {Object.entries(players).map(([key, playerData]) => (
                                 <SelectItem key={key} value={key} className="hover:bg-gray-700 focus:bg-gray-700 data-[state=checked]:bg-red-900/50 cursor-pointer" >
                                     <span className={cn(playerData.statuses.muerto && "text-gray-500 line-through")}>{playerData.personaje} ({playerData.nombre})</span>
                                     {playerData.statuses.muerto && <Skull className="inline-block ml-2 text-red-700" size={14}/>}
                                 </SelectItem>
                             ))}
                         </SelectContent>
                     </Select>
                     <Button onClick={handleAddPlayer} className="w-full sm:w-auto bg-green-700 hover:bg-green-600 text-gray-100 px-6">Añadir Investigador</Button>
                 </div>

                 {/* Player Detail Section */}
                 {currentPlayer && selectedPlayer && (
                     <div key={selectedPlayer} className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700 transition-all duration-300 ease-in-out">
                         {/* Player/Character Name */}
                         <h2 className={cn("text-2xl font-semibold mb-5 text-center text-red-400", currentPlayer.statuses.muerto && "text-gray-600 line-through")}>
                            {currentPlayer.personaje} {currentPlayer.statuses.muerto && <Skull className="inline-block ml-2 text-red-700" size={24}/>}
                         </h2>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 mb-6">
                             <div>
                                 <Label htmlFor={`nombre-${selectedPlayer}`} className={cn("block text-sm font-medium text-gray-400 mb-1", currentPlayer.statuses.muerto && "text-gray-600")}>Jugador</Label>
                                 <Input id={`nombre-${selectedPlayer}`} value={currentPlayer.nombre} onChange={(e) => handleFieldChange(selectedPlayer, 'nombre', e.target.value)} className={cn("bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 focus:border-red-500 focus:ring-red-500", currentPlayer.statuses.muerto && "bg-gray-700 text-gray-500 cursor-not-allowed line-through")} placeholder="Nombre..." disabled={currentPlayer.statuses.muerto} />
                             </div>
                             <div>
                                 <Label htmlFor={`personaje-${selectedPlayer}`} className={cn("block text-sm font-medium text-gray-400 mb-1", currentPlayer.statuses.muerto && "text-gray-600")}>Personaje</Label>
                                 <Input id={`personaje-${selectedPlayer}`} value={currentPlayer.personaje} onChange={(e) => handleFieldChange(selectedPlayer, 'personaje', e.target.value)} className={cn("bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 focus:border-red-500 focus:ring-red-500", currentPlayer.statuses.muerto && "bg-gray-700 text-gray-500 cursor-not-allowed line-through")} placeholder="Investigador..." disabled={currentPlayer.statuses.muerto} />
                             </div>
                         </div>

                          {/* Pending Checks Section */}
                          {isSessionActive && !currentPlayer.statuses.muerto && currentPlayer.pendingChecks && Object.values(currentPlayer.pendingChecks).some(check => check) && (
                            <div className="my-4 p-4 border border-yellow-600 bg-yellow-900/30 rounded-md">
                                <h4 className="text-lg font-semibold text-yellow-400 mb-3 flex items-center gap-2"><AlertTriangle size={20}/>¡Acción Requerida (Guardián)!</h4>
                                <div className="space-y-2">
                                    {currentPlayer.pendingChecks.needsMajorWoundConCheck && (<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2 bg-yellow-800/50 rounded"><span className="text-sm flex-grow">Herida Grave: Tira CON vs {currentPlayer.stats.constitucion} para evitar inconsciencia.</span><div className="flex gap-1 flex-shrink-0"><Button size="sm" variant="ghost" className="text-xs bg-green-700 hover:bg-green-600 h-7 px-2" onClick={() => handleMajorWoundConCheckResult(selectedPlayer, true)}>Superada</Button><Button size="sm" variant="ghost" className="text-xs bg-red-800 hover:bg-red-700 h-7 px-2" onClick={() => handleMajorWoundConCheckResult(selectedPlayer, false)}>Fallada</Button></div></div>)}
                                    {currentPlayer.pendingChecks.needsTempInsanityIntCheck && (<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2 bg-yellow-800/50 rounded"><span className="text-sm flex-grow">Locura Temporal: Tira INT vs {currentPlayer.stats.inteligencia} para reprimir.</span><div className="flex gap-1 flex-shrink-0"><Button size="sm" variant="ghost" className="text-xs bg-red-800 hover:bg-red-700 h-7 px-2" onClick={() => handleTempInsanityIntCheckResult(selectedPlayer, true)}>Superada (Loco)</Button><Button size="sm" variant="ghost" className="text-xs bg-green-700 hover:bg-green-600 h-7 px-2" onClick={() => handleTempInsanityIntCheckResult(selectedPlayer, false)}>Fallada (Reprimida)</Button></div></div>)}
                                    {currentPlayer.pendingChecks.needsIndefiniteInsanityConfirmation && (<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2 bg-yellow-800/50 rounded"><span className="text-sm flex-grow">{`Locura Indefinida Desencadenada (${currentPlayer.sanityLostThisSession} SAN perdido).`}</span><Button size="sm" variant="ghost" className="text-xs bg-purple-700 hover:bg-purple-600 h-7 px-2" onClick={() => confirmIndefiniteInsanity(selectedPlayer)}>Confirmar y Episodio</Button></div>)}
                                    {currentPlayer.pendingChecks.needsDyingConCheck && (<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2 bg-red-800/50 rounded"><span className="text-sm flex-grow font-bold">¡MORIBUNDO! Tira CON vs {currentPlayer.stats.constitucion} para evitar la MUERTE.</span><div className="flex gap-1 flex-shrink-0"><Button size="sm" variant="ghost" className="text-xs bg-green-700 hover:bg-green-600 h-7 px-2" onClick={() => handleDyingConCheckResult(selectedPlayer, true)}>Superada (Vive)</Button><Button size="sm" variant="ghost" className="text-xs bg-black border border-red-500 hover:bg-gray-900 h-7 px-2" onClick={() => handleDyingConCheckResult(selectedPlayer, false)}>Fallada (Muere)</Button></div></div>)}
                                    {currentPlayer.statuses.moribundo && !currentPlayer.statuses.estabilizado && (<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2 bg-blue-800/50 rounded"><span className="text-sm flex-grow">Moribundo necesita Primeros Auxilios.</span><Button size="sm" variant="ghost" className="text-xs bg-blue-600 hover:bg-blue-500 h-7 px-2 flex items-center gap-1" onClick={() => handleStabilize(selectedPlayer)}><HeartPulse size={12} /> Estabilizar</Button></div>)}
                                </div>
                            </div>
                         )}

                         {/* Status Display Section */}
                         <div className="mb-6 border-t border-b border-gray-700 py-3">
                            <h4 className="text-lg font-medium text-center text-gray-300 mb-2 flex items-center justify-center gap-2">{currentPlayer.statuses.muerto ? <Skull className="text-red-600" size={20}/> : <CheckCircle className="text-green-500" size={20}/>} Estado Actual</h4>
                             <div className="flex flex-wrap justify-center items-center gap-2 min-h-[28px]">
                                 {Object.entries(currentPlayer.statuses).map(([statusKey, isActive]) => {
                                     if (!isActive) return null;
                                     let statusLabel = '', bgColor = 'bg-gray-600', icon = <HelpCircle size={14}/>, textColor = 'text-white', tooltipText = '';
                                     const canBeCleared = !currentPlayer.statuses.muerto || statusKey === 'muerto';
                                     const isInsanity = ['locuraTemporal', 'locuraIndefinida', 'locuraSubyacente'].includes(statusKey);

                                     switch (statusKey as keyof PlayerStatuses) {
                                         case 'heridaGrave': statusLabel = 'Herida Grave'; bgColor = 'bg-orange-700'; tooltipText = "Daño >= 1/2 PV máx. Puede causar inconsciencia."; break;
                                         case 'inconsciente': statusLabel = 'Inconsciente'; bgColor = 'bg-gray-500'; tooltipText = "No puede actuar."; break;
                                         case 'locuraTemporal': statusLabel = 'Locura Temporal'; bgColor = 'bg-purple-600'; tooltipText = "Episodios activos. Pérdida SAN -> Nuevo Episodio. Al quitar, se preguntará por Locura Subyacente."; break;
                                         case 'locuraIndefinida': statusLabel = 'Locura Indefinida'; bgColor = 'bg-indigo-700'; tooltipText = "Locura subyacente dura meses. Pérdida SAN -> Episodio."; break;
                                         case 'locuraSubyacente': statusLabel = 'Locura Subyacente'; bgColor = 'bg-teal-700'; icon=<BrainCircuit size={14}/>; tooltipText = "Recuperado del episodio inicial, pero frágil. Pérdida SAN -> Episodio. Puede tener Fobias/Manías/Alucinaciones."; break;
                                         case 'moribundo': statusLabel = 'Moribundo'; bgColor = 'bg-red-800 animate-pulse'; icon = <HeartPulse size={14}/>; tooltipText = "0 PV con Herida Grave. ¡Tirada CON cada ronda/intervalo para evitar MUERTE!"; break;
                                         case 'estabilizado': statusLabel = 'Estabilizado'; bgColor = 'bg-blue-600'; icon = <HeartPulse size={14}/>; tooltipText = "Estable tras estar Moribundo (+1 PV temp). Necesita Medicina. Tirada CON/hora o vuelve a Moribundo."; break;
                                         case 'muerto': statusLabel = 'MUERTO'; bgColor = 'bg-black border border-red-500'; icon = <Skull size={14}/>; textColor = 'text-red-500 font-bold'; tooltipText = "Fin del camino... por ahora."; break;
                                     }
                                     return (
                                         <Tooltip key={statusKey}>
                                             <TooltipTrigger asChild>
                                                 <div className={cn("flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold cursor-default", bgColor, textColor)}>
                                                     {icon}<span>{statusLabel}</span>
                                                     {canBeCleared && (
                                                         <Button variant="ghost" size="icon" className={cn("h-4 w-4 text-white/70 hover:text-white hover:bg-white/10 rounded-full p-0.5", isInsanity && "ml-1")} onClick={() => handleClearStatus(selectedPlayer, statusKey as keyof PlayerStatuses)} aria-label={`Quitar ${statusLabel}`} title={`Quitar ${statusLabel}`} > <XCircle size={14}/> </Button>
                                                     )}
                                                     {statusKey === 'estabilizado' && isActive && (
                                                        <Tooltip>
                                                            <TooltipTrigger asChild> <Button variant="ghost" size="icon" className="h-4 w-4 text-red-300 hover:text-red-100 hover:bg-red-700/50 rounded-full p-0.5 ml-1" onClick={() => handleDestabilize(selectedPlayer)} aria-label="Quitar Estabilizado (Vuelve a Moribundo)"> <HeartPulse size={14}/> </Button> </TooltipTrigger>
                                                            <TooltipContent className="bg-black text-white border-gray-600"> <p className="text-xs">Desestabilizar (vuelve a Moribundo)</p> </TooltipContent>
                                                        </Tooltip>
                                                     )}
                                                 </div>
                                             </TooltipTrigger>
                                             <TooltipContent className="bg-black text-white border-gray-600 max-w-xs"><p className="text-xs">{tooltipText}</p></TooltipContent>
                                         </Tooltip>
                                     );
                                 })}
                                 {!currentPlayer.statuses.muerto && Object.values(currentPlayer.statuses).every(s => !s) && ( <p className="text-sm text-gray-500 italic">Todo normal...</p> )}
                             </div>
                         </div>

                         {/* Características Section */}
                         <h3 className="text-xl font-semibold mb-4 text-center text-gray-300">Características</h3>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5 mb-6">
                              {orderedStatNames.map((statName) => {
                                   const statValue = currentPlayer.stats[statName] ?? 0;
                                   const inputValue = statInputs[statName] ?? String(statValue);
                                   const labelText = statName.charAt(0).toUpperCase() + statName.slice(1);
                                   const isHealthOrSanity = statName === 'salud' || statName === 'cordura';
                                   const maxValue = isHealthOrSanity ? (statName === 'salud' ? currentPlayer.maxSalud : currentPlayer.maxSanity) : undefined;
                                   const isZeroHP = statName === 'salud' && statValue <= 0;
                                   const valueColor = (currentPlayer.statuses.muerto) ? "text-gray-600" : (isZeroHP && currentPlayer.statuses.moribundo) ? "text-red-700 font-black animate-pulse" : (isZeroHP) ? "text-red-700 font-black" : (statName === 'salud' && statValue <= currentPlayer.maxSalud / 2) ? "text-yellow-500" : (statName === 'cordura' && statValue <= currentPlayer.stats.poder / 5) ? "text-purple-400" : (statName === 'cordura' && statValue <= currentPlayer.maxSanity / 2) ? "text-blue-400" : "text-red-500";
                                   return (
                                       <div key={statName} className="flex flex-col items-center bg-gray-700/50 p-3 rounded-md border border-gray-600 shadow-inner">
                                           <Label htmlFor={`${statName}-${selectedPlayer}`} className={cn("text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 whitespace-nowrap", currentPlayer.statuses.muerto && "text-gray-600")}>
                                               {labelText} {isHealthOrSanity && maxValue !== undefined && <span className={cn("text-gray-500", currentPlayer.statuses.muerto && "text-gray-600")}> / {maxValue}</span>}
                                           </Label>
                                           <span className={cn("text-3xl font-bold mb-2", valueColor)}>{statValue}</span>
                                           <Input id={`${statName}-${selectedPlayer}`} type="text" value={inputValue} onChange={(e) => handleStatInputChange(statName, e.target.value)} onBlur={() => handleStatInputBlur(statName)} onKeyDown={(e) => handleStatInputKeyDown(e, statName)} className={cn("bg-gray-800 border-gray-600 text-gray-100 text-center h-8 focus:border-red-500 focus:ring-red-500 w-full", currentPlayer.statuses.muerto && "bg-gray-700 text-gray-500 cursor-not-allowed")} placeholder="Mod (+/-/=)" aria-label={`Modificar ${labelText}`} disabled={currentPlayer.statuses.muerto}/>
                                       </div>
                                   );
                              })}
                          </div>

                           {/* Collapsible Skills Notes */}
                           <div className="mb-6">
                               <Button
                                   variant="ghost"
                                   onClick={() => setIsSkillsExpanded(!isSkillsExpanded)}
                                   className="w-full flex justify-between items-center text-lg font-semibold text-gray-300 hover:bg-gray-700/50 px-3 py-2"
                                   disabled={currentPlayer.statuses.muerto}
                               >
                                   <span className="flex items-center gap-2"><BrainCircuit size={18}/> Habilidades (Notas)</span>
                                   {isSkillsExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                               </Button>
                               {isSkillsExpanded && (
                                   <Textarea
                                       id={`skills-notes-${selectedPlayer}`}
                                       value={skillsText[selectedPlayer] ?? ''}
                                       onChange={(e) => handleSkillsTextChange(selectedPlayer, e.target.value)}
                                       className={cn("mt-2 bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 focus:border-red-500 focus:ring-red-500 min-h-[150px] w-full", currentPlayer.statuses.muerto && "bg-gray-700 text-gray-500 cursor-not-allowed")}
                                       placeholder="Anota habilidades, valores, pega imágenes de ficha aquí..."
                                       disabled={currentPlayer.statuses.muerto}
                                   />
                               )}
                           </div>

                           {/* Collapsible Inventory Notes */}
                           <div className="mb-6">
                               <Button
                                   variant="ghost"
                                   onClick={() => setIsInventoryExpanded(!isInventoryExpanded)}
                                   className="w-full flex justify-between items-center text-lg font-semibold text-gray-300 hover:bg-gray-700/50 px-3 py-2"
                                   disabled={currentPlayer.statuses.muerto}
                               >
                                   <span className="flex items-center gap-2"><Swords size={18}/> Armas e Inventario (Notas)</span>
                                   {isInventoryExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                               </Button>
                               {isInventoryExpanded && (
                                   <Textarea
                                       id={`inventory-notes-${selectedPlayer}`}
                                       value={inventoryText[selectedPlayer] ?? ''}
                                       onChange={(e) => handleInventoryTextChange(selectedPlayer, e.target.value)}
                                       className={cn("mt-2 bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 focus:border-red-500 focus:ring-red-500 min-h-[150px] w-full", currentPlayer.statuses.muerto && "bg-gray-700 text-gray-500 cursor-not-allowed")}
                                       placeholder="Lista armas, equipo, posesiones aquí..."
                                       disabled={currentPlayer.statuses.muerto}
                                   />
                               )}
                           </div>

                          {/* Trasfondo Section */}
                          <h3 className="text-xl font-semibold mb-4 mt-6 text-center text-gray-300 border-t border-gray-700 pt-4">Trasfondo</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {TRASFONDO_KEYS.map(key => (
                                <div key={key}>
                                    <Label htmlFor={`${key}-${selectedPlayer}`} className={cn("block text-sm font-medium text-gray-400 mb-1", currentPlayer.statuses.muerto && "text-gray-600")}>
                                        {TRASFONDO_LABELS[key]}
                                    </Label>
                                    <Textarea
                                        id={`${key}-${selectedPlayer}`}
                                        value={trasfondoInputs[selectedPlayer]?.[key] ?? ''}
                                        onChange={(e) => handleTrasfondoChange(selectedPlayer, key, e.target.value)}
                                        className={cn("bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 focus:border-red-500 focus:ring-red-500 min-h-[80px]", currentPlayer.statuses.muerto && "bg-gray-700 text-gray-500 cursor-not-allowed")}
                                        placeholder={`${TRASFONDO_LABELS[key]}...`}
                                        disabled={currentPlayer.statuses.muerto}
                                    />
                                </div>
                            ))}
                          </div>
                     </div>
                 )}

                 {!selectedPlayer && Object.keys(players).length > 0 && ( <p className="text-center text-gray-500 mt-8">Selecciona un investigador.</p> )}
                 {Object.keys(players).length === 0 && ( <p className="text-center text-gray-500 mt-8">Añade un investigador.</p> )}

                 {/* Alert Dialogs */}
                <AlertDialog open={isBoutOfMadnessAlertOpen} onOpenChange={setIsBoutOfMadnessAlertOpen}>
                    <AlertDialogContent className="bg-gray-800 text-gray-100 border-red-700">
                        <AlertDialogHeader><AlertDialogTitle className="text-red-500 text-2xl">¡Episodio de Locura!</AlertDialogTitle><AlertDialogDescription className="text-gray-300 whitespace-pre-wrap">{boutOfMadnessResult}</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogAction className="bg-red-700 hover:bg-red-600" onClick={() => setBoutOfMadnessResult(null)}>Entendido</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                 <AlertDialog open={isSubyacenteAlertOpen} onOpenChange={setIsSubyacenteAlertOpen}>
                     <AlertDialogContent className="bg-gray-800 text-gray-100 border-yellow-600">
                         <AlertDialogHeader>
                             <AlertDialogTitle className="text-yellow-400">Fin de Locura Temporal</AlertDialogTitle>
                             <AlertDialogDescription className="text-gray-300">
                                 {playerPendingSubyacente && players[playerPendingSubyacente]
                                     ? `${players[playerPendingSubyacente].personaje} se ha recuperado del episodio inicial de Locura Temporal. ¿Entra ahora en Locura Subyacente?`
                                     : "¿Activar Locura Subyacente?"}
                             </AlertDialogDescription>
                         </AlertDialogHeader>
                         <AlertDialogFooter>
                             <AlertDialogCancel onClick={() => confirmSubyacente(false)} className="border-gray-600 hover:bg-gray-700">No (Recuperado)</AlertDialogCancel>
                             <AlertDialogAction onClick={() => confirmSubyacente(true)} className="bg-teal-700 hover:bg-teal-600">Sí (Locura Subyacente)</AlertDialogAction>
                         </AlertDialogFooter>
                     </AlertDialogContent>
                 </AlertDialog>
                                  {/* Sanity Check Modal */}
                                  <AlertDialog open={isSanityCheckModalOpen} onOpenChange={setIsSanityCheckModalOpen}>
                    <AlertDialogContent className="bg-gray-800 text-gray-100 border-blue-600">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="text-blue-400 text-2xl">Chequeo de Cordura Grupal</AlertDialogTitle>
                            <AlertDialogDescription className="text-gray-300">
                                Introduce la pérdida de SAN y los resultados de las tiradas.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                                                {/* Inputs de Pérdida SAN */}
                                                <div className="my-4 space-y-3">
                            <div>
                                <Label htmlFor="sanity-loss-success" className="text-sm font-medium text-gray-400 block mb-1">Pérdida SAN (Éxito)</Label>
                                <Input
                                    id="sanity-loss-success"
                                    value={sanityCheckSuccessLoss}
                                    onChange={(e) => setSanityCheckSuccessLoss(e.target.value)}
                                    className="bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500"
                                    placeholder="Ej: 0, 1, 1d2"
                                />
                            </div>
                            <div>
                                <Label htmlFor="sanity-loss-failure" className="text-sm font-medium text-gray-400 block mb-1">Pérdida SAN (Fallo)</Label>
                                <Input
                                    id="sanity-loss-failure"
                                    value={sanityCheckFailureLoss}
                                    onChange={(e) => setSanityCheckFailureLoss(e.target.value)}
                                    className="bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500"
                                    placeholder="Ej: 1d4, 1d6, 5"
                                />
                            </div>
                                                         {/* Inputs de Resultados (d100) */}
                            <div className="pt-3 border-t border-gray-700 mt-3 space-y-2 max-h-60 overflow-y-auto pr-2">
                                <h4 className="text-sm font-medium text-gray-300 mb-2">Resultados Tirada d100 (vs Cordura):</h4>
                                {Object.entries(players)
                                    .filter(([key, player]) => !player.statuses.muerto) // Filtrar jugadores no muertos
                                    .map(([playerKey, player]) => (
                                    <div key={playerKey} className="flex items-center justify-between space-x-2">
                                        <Label htmlFor={`roll-${playerKey}`} className="text-sm text-gray-400 whitespace-nowrap">
                                            {player.personaje}:
                                        </Label>
                                        <Input
                                            id={`roll-${playerKey}`}
                                            type="number" // Sugerencia de tipo numérico
                                            min="1" max="100" // Validación básica
                                            value={sanityCheckRolls[playerKey] ?? ''} // Mostrar valor o vacío
                                            onChange={(e) => setSanityCheckRolls(prev => ({ ...prev, [playerKey]: e.target.value }))}
                                            className="bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500 w-24 h-8 text-center"
                                            placeholder="1-100"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <AlertDialogFooter>
                            <AlertDialogCancel className="border-gray-600 hover:bg-gray-700">Cancelar</AlertDialogCancel>
                            <AlertDialogAction className="bg-blue-700 hover:bg-blue-600" onClick={handleProcessSanityCheckInputs}>Siguiente</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                 </AlertDialog>
                             {/* Sanity Update Sequence Modal */}
                 <AlertDialog open={isSanityUpdateSequenceActive}> {/* Sin onOpenChange para forzar la secuencia */}
                    {sequenceData.length > 0 && currentSequenceIndex < sequenceData.length && ( // Asegurar datos válidos
                        <AlertDialogContent className="bg-gray-800 text-gray-100 border-yellow-600">
                            <AlertDialogHeader>
                                <AlertDialogTitle className="text-yellow-400 text-xl">
                                    Actualizar Cordura: {sequenceData[currentSequenceIndex].personaje} ({currentSequenceIndex + 1}/{sequenceData.length})
                                </AlertDialogTitle>
                                <AlertDialogDescription className="text-gray-300">
                                    Resultado: <span className={cn("font-semibold", sequenceData[currentSequenceIndex].success ? "text-green-400" : "text-red-400")}>{sequenceData[currentSequenceIndex].success ? 'ÉXITO' : 'FALLO'}</span> (Tiró {sequenceData[currentSequenceIndex].roll} vs {sequenceData[currentSequenceIndex].currentSanity}).
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            {/* Determinar si hay episodio para el jugador actual */}
                                                    {/* IIFE para obtener datos y determinar pausa */}
                                                    {(() => {
                                // Asegurarse de que hay datos válidos antes de intentar acceder
                                if (!sequenceData || sequenceData.length === 0 || currentSequenceIndex >= sequenceData.length) {
                                    return <p className="text-center text-gray-500">Cargando datos de secuencia...</p>; // O algún fallback
                                }
                                const currentStepData = sequenceData[currentSequenceIndex];
                                const pauseInfo = currentSequencePauseReason?.playerKey === currentStepData.playerKey ? currentSequencePauseReason : null;

                                // --- Renderizado Condicional ---
                                return (
                                    <>
                                        {/* --- Contenido Principal Condicional --- */}
                                        <div className="my-4 space-y-3">
                                            {pauseInfo?.type === 'episode' && (
                                                <div className="p-3 bg-red-900/30 border border-red-700 rounded-md">
                                                    <h4 className="text-red-400 font-semibold mb-2">¡Episodio de Locura Desencadenado!</h4>
                                                    <p className="text-sm text-gray-200 whitespace-pre-wrap">{pauseInfo.data.boutText}</p>
                                                </div>
                                            )}

                                            {pauseInfo?.type === 'temp_int_check' && (
                                                 <div className="p-3 bg-yellow-900/30 border border-yellow-700 rounded-md">
                                                    <h4 className="text-yellow-400 font-semibold mb-2">Acción Requerida: Locura Temporal</h4>
                                                    <p className="text-sm text-gray-200">
                                                        {currentStepData.personaje} perdió {pauseInfo.data.lossAmount} SAN (>= 5). Debe superar una tirada de INT vs {pauseInfo.data.intelligence} para evitar la locura temporal.
                                                    </p>
                                                    <p className="text-xs text-gray-400 mt-1">(Si supera la tirada INT, entra en Locura Temporal. Si falla, reprime el horror y no hay efecto inmediato).</p>
                                                </div>
                                            )}

                                            {pauseInfo?.type === 'indef_confirm' && (
                                                <div className="p-3 bg-purple-900/30 border border-purple-700 rounded-md">
                                                    <h4 className="text-purple-400 font-semibold mb-2">Acción Requerida: Locura Indefinida</h4>
                                                    <p className="text-sm text-gray-200">
                                                         ¡Locura Indefinida desencadenada para {currentStepData.personaje}! (Pérdida sesión: {pauseInfo.data.sessionLoss} >= {pauseInfo.data.threshold}, 1/5 de {pauseInfo.data.sanityBefore} SAN).
                                                    </p>
                                                    <p className="text-xs text-gray-400 mt-1">(Confirmar activará el estado y desencadenará un episodio de locura inmediato).</p>
                                                </div>
                                            )}

                                            {!pauseInfo && ( // Si no hay pausa, mostrar input de pérdida
                                                <>
                                                    <Label htmlFor="sanity-loss-input" className="text-sm font-medium text-gray-400 block mb-1">
                                                        Introduce la pérdida de Cordura ({currentStepData.lossAmountString}):
                                                    </Label>
                                                    <Input
                                                        id="sanity-loss-input"
                                                        type="number" min="0"
                                                        value={currentSanityLossInput}
                                                        onChange={(e) => setCurrentSanityLossInput(e.target.value)}
                                                        className="bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 focus:border-yellow-500 focus:ring-yellow-500 w-full text-center h-10 text-lg"
                                                        placeholder="Pérdida SAN" autoFocus disabled={isConfirmingLoss}
                                                    />
                                                </>
                                            )}
                                        </div>

                                        {/* --- Footer Condicional --- */}
                                        <AlertDialogFooter>
                                             {pauseInfo?.type === 'episode' && (
                                                <AlertDialogAction className="bg-green-700 hover:bg-green-600" onClick={() => console.log('TODO: Llamar handleAcknowledgePause')}>
                                                    Episodio Anotado / Continuar
                                                </AlertDialogAction>
                                            )}
                                            {pauseInfo?.type === 'temp_int_check' && (
                                                <div className="flex gap-2 w-full justify-end">
                                                      <Button size="sm" variant="outline" className="text-xs bg-red-800 hover:bg-red-700 h-8 px-3 border-red-600" onClick={() => console.log('TODO: Llamar handleResolveTempIntCheck(true)')}>
                                                          Superada (Loco)
                                                      </Button>
                                                      <Button size="sm" variant="outline" className="text-xs bg-green-700 hover:bg-green-600 h-8 px-3 border-green-600" onClick={() => console.log('TODO: Llamar handleResolveTempIntCheck(false)')}>
                                                          Fallada (Reprimida)
                                                      </Button>
                                                </div>
                                            )}
                                             {pauseInfo?.type === 'indef_confirm' && (
                                                 <AlertDialogAction className="bg-purple-700 hover:bg-purple-600" onClick={() => console.log('TODO: Llamar handleResolveIndefConfirm')}>
                                                     Confirmar Locura Indefinida y Episodio
                                                 </AlertDialogAction>
                                            )}
                                            {!pauseInfo && ( // Botón Confirmar Pérdida si no hay pausa
                                                <AlertDialogAction
                                                    className={cn("bg-yellow-700 hover:bg-yellow-600 flex items-center justify-center gap-2", isConfirmingLoss && "opacity-75 cursor-not-allowed")}
                                                    onClick={handleConfirmSanityLoss} disabled={isConfirmingLoss}
                                                >
                                                    {isConfirmingLoss ? ( <><Loader2 className="h-4 w-4 animate-spin" /> Procesando...</> ) : ( "Confirmar Pérdida" )}
                                                </AlertDialogAction>
                                            )}
                                        </AlertDialogFooter>
                                    </>
                                );
                            })()}
                        </AlertDialogContent>
                    )}
                    {/* Podríamos poner un fallback aquí si sequenceData está vacío, pero no debería ocurrir si la lógica de inicio es correcta */}
                 </AlertDialog>
                    

            </div>
        </TooltipProvider>
    );
} 
                    // --- Lógica de Avance/Pausa ---
        if (detectedPauseReason) {
            // Pausar la secuencia
            console.log(`Pausando secuencia para ${detectedPauseReason.playerKey}. Razón: ${detectedPauseReason.type}`);
            setCurrentSequencePauseReason(detectedPauseReason);
            // No avanzar, el modal cambiará para mostrar la razón de la pausa
        } else {
            // No hubo pausa, avanzar normalmente
            advanceOrEndSequence(playerKey);
        }
        // --- Fin Lógica de Avance/Pausa ---    

    } finally {
        setIsConfirmingLoss(false); // Asegurar que el estado de carga se desactive
    }
finally {
    setIsConfirmingLoss(false); // Asegurar que el estado de carga se desactive
}
};

export default CthulhuTracker;