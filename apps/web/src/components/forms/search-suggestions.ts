import type {SearchSuggestion} from "./search-input";

/** Search only existing authorized page data; never fetch collections for previews. */
export function matchingSuggestions(query: string, suggestions: readonly (SearchSuggestion & {searchText?: string})[]): SearchSuggestion[] {
  const term = query.trim().toLocaleLowerCase();
  return suggestions.filter(item => (item.searchText === undefined ? [item.label, item.context, item.value] : [item.searchText]).some(value => value?.toLocaleLowerCase().includes(term))).slice(0, 6).map(({key, label, context, value}) => ({key, label, context, value}));
}
