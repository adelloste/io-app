/**
 * Messages combined reducer
 */

import * as pot from "@pagopa/ts-commons/lib/pot";
import { combineReducers } from "redux";
import { createSelector } from "reselect";

import { Action } from "../../../actions/types";
import messagesAllIdsReducer, {
  messagesAllIdsSelector,
  MessagesAllIdsState
} from "./messagesAllIds";

import messagesByIdReducer, {
  messagesStateByIdSelector,
  MessageState,
  MessageStateById
} from "./messagesById";
import messagesIdsByServiceIdReducer, {
  MessagesIdsByServiceId
} from "./messagesIdsByServiceId";
import {
  EMPTY_MESSAGE_STATUS,
  messagesStatusSelector,
  MessageStatus
} from "./messagesStatus";
import allPaginatedReducer, { AllPaginated } from "./allPaginated";
import detailsByIdReducer, { DetailsById } from "./detailsById";
import paginatedByIdReducer, { PaginatedById } from "./paginatedById";
import { thirdPartyByIdReducer, ThirdPartyById } from "./thirdPartyById";

export type MessagesState = Readonly<{
  byId: MessageStateById;
  allIds: MessagesAllIdsState; // FIXME: is this used?
  idsByServiceId: MessagesIdsByServiceId;
  allPaginated: AllPaginated;
  paginatedById: PaginatedById;
  detailsById: DetailsById;
  thirdPartyById: ThirdPartyById;
}>;

const reducer = combineReducers<MessagesState, Action>({
  byId: messagesByIdReducer,
  allIds: messagesAllIdsReducer,
  idsByServiceId: messagesIdsByServiceIdReducer,
  allPaginated: allPaginatedReducer,
  paginatedById: paginatedByIdReducer,
  detailsById: detailsByIdReducer,
  thirdPartyById: thirdPartyByIdReducer
});

// Selectors

/**
 * Returns array of messages IDs inversely lexically ordered.
 */
export const lexicallyOrderedMessagesIds = createSelector(
  messagesAllIdsSelector,
  potIds =>
    pot.map(potIds, ids =>
      [...ids].sort((a: string, b: string) => b.localeCompare(a))
    )
);

// this type is need to combine message data to message status. Note
// that message status is a data held only by the app (isRead / isArchived)
export type MessagesStateAndStatus = MessageState & MessageStatus;
/**
 * A selector that using the inversely lexically ordered messages IDs
 * returned by lexicallyOrderedMessagesIds returns an array of the
 * mapped/related messages.
 */
export const lexicallyOrderedMessagesStateSelector = createSelector(
  lexicallyOrderedMessagesIds,
  messagesStateByIdSelector,
  messagesStatusSelector,
  (potIds, messageStateById, messagesStatus) =>
    pot.map(potIds, ids =>
      ids.reduce(
        (acc: ReadonlyArray<MessagesStateAndStatus>, messageId: string) => {
          const message = messageStateById[messageId];
          if (message === undefined) {
            return acc;
          }
          const messageStatus =
            messagesStatus[messageId] || EMPTY_MESSAGE_STATUS;
          return [
            ...acc,
            {
              ...message,
              ...messageStatus
            }
          ];
        },
        []
      )
    )
);

export const messagesUnreadAndUnarchivedSelector = createSelector(
  lexicallyOrderedMessagesStateSelector,
  potMessagesState =>
    pot.getOrElse(
      pot.map(potMessagesState, _ =>
        _.filter(
          messageState => !messageState.isRead && !messageState.isArchived
        )
      ),
      []
    ).length
);

export default reducer;
