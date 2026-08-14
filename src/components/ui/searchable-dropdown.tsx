"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type DropdownOption = {
  value: string;
  label: string;
  description?: string;
  keywords?: string;
};

type SearchableDropdownProps = {
  id: string;
  value: string;
  options: DropdownOption[];
  placeholder: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
};

export function SearchableDropdown({
  id,
  value,
  options,
  placeholder,
  onValueChange,
  disabled = false,
  invalid = false,
  searchable = false,
  searchPlaceholder = "ค้นหา...",
  emptyMessage = "ไม่พบข้อมูล"
}: SearchableDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = `${useId()}-listbox`;
  const selectedOption = options.find((option) => option.value === value);
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("th");

    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) =>
      `${option.label} ${option.description ?? ""} ${option.keywords ?? ""}`
        .toLocaleLowerCase("th")
        .includes(normalizedQuery)
    );
  }, [options, query]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  function closeDropdown() {
    setIsOpen(false);
    setQuery("");
  }

  function handleSelect(optionValue: string) {
    onValueChange(optionValue);
    closeDropdown();
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-invalid={invalid}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-3 rounded-md border border-input bg-background px-3 py-2 text-left text-sm outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          !selectedOption && "text-muted-foreground"
        )}
        disabled={disabled}
        id={id}
        onClick={() => {
          setIsOpen((open) => !open);
          setQuery("");
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            closeDropdown();
          }

          if (event.key === "ArrowDown" && !isOpen) {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
        role="combobox"
        type="button"
      >
        <span className="truncate">{selectedOption?.label ?? placeholder}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen ? (
        <div className="absolute left-0 top-full z-50 mt-2 w-full overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
          {searchable ? (
            <div className="border-b border-border p-2">
              <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
                <Search aria-hidden="true" className="size-4 text-muted-foreground" />
                <input
                  aria-label={searchPlaceholder}
                  autoFocus
                  className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      closeDropdown();
                    }
                  }}
                  placeholder={searchPlaceholder}
                  type="search"
                  value={query}
                />
              </div>
            </div>
          ) : null}

          <div
            aria-label="ตัวเลือก"
            className="max-h-64 overflow-y-auto p-1"
            id={listboxId}
            role="listbox"
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const isSelected = option.value === value;

                return (
                  <button
                    aria-selected={isSelected}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-sm outline-none transition-colors",
                      "hover:bg-accent focus-visible:bg-accent",
                      isSelected && "bg-secondary"
                    )}
                    key={option.value}
                    onClick={() => handleSelect(option.value)}
                    role="option"
                    type="button"
                  >
                    <Check
                      aria-hidden="true"
                      className={cn(
                        "size-4 shrink-0 text-primary",
                        !isSelected && "invisible"
                      )}
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {option.label}
                      </span>
                      {option.description ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
