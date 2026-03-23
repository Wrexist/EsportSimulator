import { useGameStore } from '@/store/game-store'
import logger from '@/lib/logger'

/**
 * Data Export Utilities
 * Export game data in various formats
 */

// Export to JSON
export function exportToJSON(data: any, filename: string) {
    try {
        const jsonString = JSON.stringify(data, null, 2)
        const blob = new Blob([jsonString], { type: 'application/json' })
        downloadBlob(blob, `${filename}.json`)
        logger.info('Exported data to JSON:', filename)
    } catch (error) {
        logger.error('Failed to export JSON:', error)
        throw error
    }
}

// Export to CSV
export function exportToCSV(data: any[], filename: string) {
    try {
        if (data.length === 0) throw new Error('No data to export')

        const headers = Object.keys(data[0])
        const csvRows = [
            headers.join(','),
            ...data.map(row =>
                headers.map(header => {
                    const value = row[header]
                    // Escape quotes and wrap in quotes if contains comma
                    const escaped = String(value).replace(/"/g, '""')
                    return escaped.includes(',') ? `"${escaped}"` : escaped
                }).join(',')
            )
        ]

        const csvString = csvRows.join('\n')
        const blob = new Blob([csvString], { type: 'text/csv' })
        downloadBlob(blob, `${filename}.csv`)
        logger.info('Exported data to CSV:', filename)
    } catch (error) {
        logger.error('Failed to export CSV:', error)
        throw error
    }
}

// Export save file
export async function exportSaveFile() {
    try {
        const state = useGameStore.getState()
        // Export core state data
        const saveData = {
            saveId: state.saveId,
            saveName: state.saveName,
            playerTeamId: state.playerTeamId,
            currentWeek: state.currentWeek,
            teams: state.teams,
            players: state.players,
            staff: state.staff,
            contracts: state.contracts,
            tournaments: state.tournaments,
            scheduledMatches: state.scheduledMatches,
            completedMatches: state.completedMatches,
            financeLedger: state.financeLedger,
            eventsLog: state.eventsLog,
            managerDetails: state.managerDetails,
            hallOfFame: state.hallOfFame,
            exportedAt: new Date().toISOString()
        }

        const filename = `${state.saveName}_${new Date().toISOString().split('T')[0]}`
        exportToJSON(saveData, filename)
        return true
    } catch (error) {
        logger.error('Failed to export save file:', error)
        return false
    }
}

// Export player stats
export function exportPlayerStats() {
    const { players, teams } = useGameStore.getState()

    const stats = players.map(p => ({
        Name: p.nickname,
        Age: p.age,
        Role: (p as any).role || 'Unknown',
        Overall: (p as any).overall || 0,
        Nationality: p.nationality,
        Team: teams.find(t => (t as any).players?.includes(p.id))?.name || 'Free Agent'
    }))

    exportToCSV(stats, 'player-stats')
}

// Export team finances
export function exportFinances() {
    const { financeLedger } = useGameStore.getState()

    const finances = financeLedger.map(entry => ({
        Week: entry.week,
        Type: entry.type,
        Description: entry.description,
        Amount: entry.amount,
        Balance: entry.newBalance
    }))

    exportToCSV(finances, 'financial-ledger')
}

// Export match history
export function exportMatchHistory() {
    const { completedMatches, teams } = useGameStore.getState()

    const history = completedMatches.map(match => {
        const homeTeam = teams.find(t => t.id === match.homeTeamId)
        const awayTeam = teams.find(t => t.id === match.awayTeamId)

        return {
            Date: `Week ${match.week}`,
            HomeTeam: homeTeam?.name || 'Unknown',
            AwayTeam: awayTeam?.name || 'Unknown',
            Score: `${match.result?.homeScore || 0} - ${match.result?.awayScore || 0}`,
            Winner: (match.result as any)?.winnerId === homeTeam?.id ? homeTeam?.name : (match.result as any)?.winnerId === awayTeam?.id ? awayTeam?.name : 'Draw',
            Format: match.format
        }
    })

    exportToCSV(history, 'match-history')
}

// Helper to download blob
function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}

// Import save file
export async function importSaveFile(file: File): Promise<boolean> {
    try {
        const text = await file.text()
        const data = JSON.parse(text)

        // Basic validation
        if (!data.saveId) {
            throw new Error('Invalid save file format')
        }

        // Import would require custom load logic
        // For now, just log success
        logger.info('Save file validated successfully:', data.saveName)
        return true
    } catch (error) {
        logger.error('Failed to import save file:', error)
        return false
    }
}
