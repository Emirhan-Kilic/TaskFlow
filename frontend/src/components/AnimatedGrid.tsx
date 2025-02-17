import { useEffect, useRef } from 'react';

interface CellState {
    intensity: number;
}

export function AnimatedGrid() {
    const gridRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const grid = gridRef.current;
        if (!grid) return;

        // Configuration
        const CELL_SIZE = 60;
        const FRAME_RATE = 1000 / 30;
        const MAX_DISTANCE = 180;
        const THROTTLE_MS = 12;

        // Setup grid container
        const gridContainer = createGridContainer();
        const { cells, cellStates } = createCells();
        grid.appendChild(gridContainer);

        // Animation state
        let animationFrameId: number;
        let lastTime = 0;
        let throttleTimeout: number | null = null;

        // Start animation
        animationFrameId = requestAnimationFrame(updateCells);

        // Event listeners
        document.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('resize', handleResize);

        // Cleanup
        return () => cleanup();

        // Helper functions
        function createGridContainer() {
            const container = document.createElement('div');
            container.className = 'grid w-full h-full';
            container.style.gridTemplateColumns = `repeat(auto-fill, minmax(${CELL_SIZE}px, 1fr))`;
            container.style.gridTemplateRows = `repeat(auto-fill, minmax(${CELL_SIZE}px, 1fr))`;
            container.style.gap = '0px';
            return container;
        }

        function createCells() {
            const cells: HTMLDivElement[] = [];
            const cellStates: CellState[] = [];
            const cellsNeeded = Math.ceil((window.innerWidth / CELL_SIZE) * (window.innerHeight / CELL_SIZE));

            for (let i = 0; i < cellsNeeded; i++) {
                const cell = document.createElement('div');
                cell.className = 'w-full h-full border-[0.5px] border-slate-700/10 transition-all duration-300 will-change-transform';
                gridContainer.appendChild(cell);
                cells.push(cell);
                cellStates.push({ intensity: 0 });
            }

            return { cells, cellStates };
        }

        function updateCells(currentTime: number) {
            if (currentTime - lastTime < FRAME_RATE) {
                animationFrameId = requestAnimationFrame(updateCells);
                return;
            }
            lastTime = currentTime;

            let needsUpdate = false;
            cells.forEach((cell, index) => {
                if (cellStates[index].intensity > 0) {
                    needsUpdate = true;
                    updateCell(cell, cellStates[index]);
                }
            });

            if (!needsUpdate) {
                lastTime = 0;
            }

            animationFrameId = requestAnimationFrame(updateCells);
        }

        function updateCell(cell: HTMLDivElement, state: CellState) {
            const intensity = state.intensity;
            cell.style.backgroundColor = `rgba(59, 130, 246, ${intensity * 0.8})`;
            cell.style.transform = `scale3d(${1 + intensity * 0.2}, ${1 + intensity * 0.2}, 1)`;
            cell.style.boxShadow = `0 0 ${20 * intensity}px rgba(59, 130, 246, ${intensity * 0.5})`;
            state.intensity *= 0.85;

            if (state.intensity < 0.01) {
                resetCell(cell, state);
            }
        }

        function resetCell(cell: HTMLDivElement, state: CellState) {
            state.intensity = 0;
            cell.style.backgroundColor = '';
            cell.style.transform = 'scale3d(1, 1, 1)';
            cell.style.boxShadow = '';
        }

        function handleMouseMove(e: MouseEvent) {
            if (throttleTimeout) return;

            throttleTimeout = window.setTimeout(() => {
                throttleTimeout = null;
                updateCellIntensities(e.clientX, e.clientY);
            }, THROTTLE_MS);
        }

        function updateCellIntensities(mouseX: number, mouseY: number) {
            cells.forEach((cell, index) => {
                const rect = cell.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;

                const distance = Math.sqrt(
                    Math.pow(mouseX - centerX, 2) + 
                    Math.pow(mouseY - centerY, 2)
                );

                if (distance < MAX_DISTANCE) {
                    const newIntensity = Math.pow(1 - (distance / MAX_DISTANCE), 2);
                    cellStates[index].intensity = Math.max(
                        newIntensity,
                        cellStates[index].intensity
                    );
                }
            });
        }

        function handleResize() {
            if (throttleTimeout) {
                window.clearTimeout(throttleTimeout);
                throttleTimeout = null;
            }

            const newCellsNeeded = Math.ceil((window.innerWidth / CELL_SIZE) * (window.innerHeight / CELL_SIZE));
            adjustCellCount(newCellsNeeded);
        }

        function adjustCellCount(newCellsNeeded: number) {
            while (cells.length > newCellsNeeded) {
                const cell = cells.pop();
                cellStates.pop();
                cell?.remove();
            }

            while (cells.length < newCellsNeeded) {
                const cell = document.createElement('div');
                cell.className = 'w-full h-full border-[0.5px] border-slate-700/10 transition-all duration-300 will-change-transform';
                gridContainer.appendChild(cell);
                cells.push(cell);
                cellStates.push({ intensity: 0 });
            }
        }

        function cleanup() {
            if (throttleTimeout) {
                window.clearTimeout(throttleTimeout);
            }
            document.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animationFrameId);
            gridContainer.remove();
        }
    }, []);

    return (
        <div ref={gridRef} className="absolute inset-0 z-0">
            {/* Grid will be created by JavaScript */}
        </div>
    );
} 