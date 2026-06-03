"use client"

import { useState, useMemo, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, X, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SearchFilterProps<T> {
    data: T[]
    onFilter: (filtered: T[]) => void
    searchFields: (keyof T)[]
    filterOptions?: {
        field: keyof T
        label: string
        options: { value: string; label: string }[]
    }[]
    placeholder?: string
    className?: string
}

/**
 * Universal Search & Filter Component
 * Works with any data type
 * 
 * @example
 * <SearchFilter
 *   data={players}
 *   searchFields={['name', 'role', 'nationality']}
 *   filterOptions={[
 *     {
 *       field: 'role',
 *       label: 'Role',
 *       options: [
 *         { value: 'awper', label: 'AWPer' },
 *         { value: 'rifler', label: 'Rifler' }
 *       ]
 *     }
 *   ]}
 *   onFilter={setFilteredPlayers}
 * />
 */
export function SearchFilter<T extends Record<string, any>>({
    data,
    onFilter,
    searchFields,
    filterOptions = [],
    placeholder = "Search...",
    className
}: SearchFilterProps<T>) {
    const [searchQuery, setSearchQuery] = useState('')
    const [filters, setFilters] = useState<Record<string, string>>({})

    // Perform filtering
    const filtered = useMemo(() => {
        return data.filter(item => {
            // Search match
            const searchLower = searchQuery.toLowerCase()
            const searchMatch = !searchQuery || searchFields.some(field => {
                const value = item[field]
                return value?.toString().toLowerCase().includes(searchLower)
            })

            // Filter match
            const filterMatch = Object.entries(filters).every(([field, value]) => {
                if (!value || value === 'all') return true
                return item[field as keyof T] === value
            })

            return searchMatch && filterMatch
        })
    }, [data, searchQuery, filters, searchFields])

    // Update parent when filtered data changes. This MUST be useEffect, not
    // useMemo — calling a parent setter (onFilter typically setState) during the
    // render phase triggers React's "cannot update while rendering" warning and,
    // if onFilter isn't memoized by the caller, an infinite render loop.
    useEffect(() => {
        onFilter(filtered)
    }, [filtered, onFilter])

    const hasActiveFilters = searchQuery || Object.values(filters).some(v => v && v !== 'all')

    const clearAll = () => {
        setSearchQuery('')
        setFilters({})
    }

    return (
        <div className={`space-y-3 ${className || ''}`}>
            <div className="flex gap-2 flex-wrap">
                {/* Search Input */}
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder={placeholder}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 pr-10"
                    />
                    {searchQuery && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                            onClick={() => setSearchQuery('')}
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    )}
                </div>

                {/* Filter Dropdowns */}
                {filterOptions.map(option => (
                    <Select
                        key={option.field as string}
                        value={filters[option.field as string] || 'all'}
                        onValueChange={(value) => setFilters(prev => ({
                            ...prev,
                            [option.field]: value
                        }))}
                    >
                        <SelectTrigger className="w-[160px]">
                            <Filter className="w-4 h-4 mr-2" />
                            <SelectValue placeholder={option.label} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All {option.label}</SelectItem>
                            {option.options.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ))}

                {/* Clear Filters */}
                {hasActiveFilters && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={clearAll}
                        className="gap-2"
                    >
                        <X className="w-4 h-4" />
                        Clear
                    </Button>
                )}
            </div>

            {/* Results Count */}
            <div className="text-xs text-muted-foreground">
                Showing {filtered.length} of {data.length} results
                {hasActiveFilters && ' (filtered)'}
            </div>
        </div>
    )
}

/**
 * Simple hook for filtering data
 */
export function useSearch<T>(
    data: T[],
    searchFields: (keyof T)[],
    initialQuery = ''
) {
    const [query, setQuery] = useState(initialQuery)

    const filtered = useMemo(() => {
        if (!query) return data

        const queryLower = query.toLowerCase()
        return data.filter(item =>
            searchFields.some(field => {
                const value = item[field]
                return value?.toString().toLowerCase().includes(queryLower)
            })
        )
    }, [data, query, searchFields])

    return {
        query,
        setQuery,
        filtered,
        clear: () => setQuery('')
    }
}
