import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  createDirectoryContact,
  directoryPeopleQueryKey,
  fetchDirectoryContacts,
  type ContactCreateInput,
} from "../lib/peopleDirectoryApi";
import { normalizeMailboxForComparison } from "../lib/mailboxNormalize";
import type { DirectoryContact } from "../data/contactsDirectory";

export function useDirectoryPeople(photographerId: string | null) {
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: photographerId ? directoryPeopleQueryKey(photographerId) : ["directory", "people", "none"],
    queryFn: () => fetchDirectoryContacts(photographerId!),
    enabled: Boolean(photographerId),
  });

  const contacts = q.data ?? [];

  const findByEmail = useCallback(
    (email: string): DirectoryContact | undefined => {
      const n = normalizeMailboxForComparison(email);
      return contacts.find((c) => normalizeMailboxForComparison(c.email) === n);
    },
    [contacts],
  );

  const createMutation = useMutation({
    mutationFn: async (input: ContactCreateInput) => {
      if (!photographerId) throw new Error("Not signed in");
      return createDirectoryContact(photographerId, input);
    },
    onSuccess: () => {
      if (photographerId) {
        void queryClient.invalidateQueries({ queryKey: directoryPeopleQueryKey(photographerId) });
      }
    },
  });

  const refetch = useCallback(async () => {
    if (!photographerId) return;
    await queryClient.refetchQueries({ queryKey: directoryPeopleQueryKey(photographerId) });
  }, [photographerId, queryClient]);

  return {
    contacts,
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    error: q.error,
    refetch,
    findByEmail,
    createContact: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
}
