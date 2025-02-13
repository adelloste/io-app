/* eslint-disable functional/immutable-data */
import * as pot from "@pagopa/ts-commons/lib/pot";
import { Tuple2 } from "@pagopa/ts-commons/lib/tuples";
import {
  compareAsc,
  differenceInMonths,
  endOfMonth,
  endOfYesterday,
  startOfDay,
  startOfMonth,
  startOfToday,
  subMonths
} from "date-fns";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import { View } from "native-base";
import React from "react";
import { SectionListScrollParams, StyleSheet } from "react-native";

import I18n from "../../i18n";
import {
  lexicallyOrderedMessagesStateSelector,
  MessagesStateAndStatus
} from "../../store/reducers/entities/messages";
import { MessageState } from "../../store/reducers/entities/messages/messagesById";
import { isCreatedMessageWithContentAndDueDate } from "../../types/CreatedMessageWithContentAndDueDate";
import { ComponentProps } from "../../types/react";
import { DateFromISOString } from "../../utils/dates";
import { isTestEnv } from "../../utils/environment";
import {
  InjectedWithItemsSelectionProps,
  withItemsSelection
} from "../helpers/withItemsSelection";
import ListSelectionBar from "../ListSelectionBar";
import MessageAgenda, {
  isPlaceholderItem,
  MessageAgendaItem,
  MessageAgendaSection,
  Sections
} from "./MessageAgenda";

// How many past months to load in batch
const PAST_DATA_MONTHS = 3;

const styles = StyleSheet.create({
  listWrapper: {
    flex: 1
  },
  listContainer: {
    flex: 1
  }
});

type OwnProps = {
  currentTab: number;
  messagesState: ReturnType<typeof lexicallyOrderedMessagesStateSelector>;
  navigateToMessageDetail: (id: string) => void;
  setMessagesArchivedState: (
    ids: ReadonlyArray<string>,
    archived: boolean
  ) => void;
};

type Props = Pick<
  ComponentProps<typeof MessageAgenda>,
  "servicesById" | "paymentsByRptId"
> &
  OwnProps &
  InjectedWithItemsSelectionProps;

type State = {
  isWorking: boolean;
  sections: Sections;
  // Here we save the sections to render.
  // We only want to render sections starting from a specific time limit.
  sectionsToRender: Sections;
  maybeLastLoadedStartOfMonthTime: O.Option<number>;
  lastMessagesState?: pot.Pot<ReadonlyArray<MessageState>, string>;
  allMessageIdsState: Set<string>;
  isContinuosScrollEnabled: boolean;
  lastDeadlineId: O.Option<string>;
  nextDeadlineId: O.Option<string>;
};

/**
 * Return the ID of the first non-placeholder item of the first section, if any.
 */
const getLastDeadlineId = (sections: Sections): O.Option<string> => {
  if (sections[0] && sections[0].data[0]) {
    const item = sections[0].data[0];
    if (isPlaceholderItem(item)) {
      return O.none;
    }
    return O.some(item.e1.id);
  }
  return O.none;
};

export const testGetLastDeadlineId = isTestEnv ? getLastDeadlineId : undefined;

/**
 * Return the ID of the first upcoming non-placeholder item from start of today, if any.
 */
const getNextDeadlineId = (sections: Sections): O.Option<string> => {
  const now = startOfDay(new Date()).getTime();
  return pipe(
    sections.reduce<O.Option<MessageAgendaItem>>((acc, curr) => {
      const item = curr.data[0];
      // if item is fake, return the accumulator
      if (isPlaceholderItem(item)) {
        return acc;
      }
      const newDate = new Date(item.e1.content.due_date).getTime();
      const diff = newDate - now;
      // if the acc is O.none, we don't need to make comparison with previous value
      if (O.isNone(acc)) {
        // just check the newDate is about future
        return diff >= 0 ? O.some(item) : O.none;
      }
      const lastDate = acc.value.e1.content.due_date.getTime();
      // if the new date is about future and is less than in accumulator
      if (diff >= 0 && diff < now - lastDate) {
        return O.some(item);
      }
      return acc;
    }, O.none),
    O.map(item => item.e1.id)
  );
};

export const testGetNextDeadlineId = isTestEnv ? getNextDeadlineId : undefined;

/**
 * Filter only the messages with a due date and group them by due_date day.
 */
const generateSections = (
  potMessagesState: pot.Pot<ReadonlyArray<MessagesStateAndStatus>, string>
): Sections =>
  pot.getOrElse(
    pot.map(
      potMessagesState,
      _ =>
        // eslint-disable-next-line
        _.reduce<MessageAgendaItem[]>((accumulator, messageState) => {
          const { message, isArchived, isRead } = messageState;
          if (
            !isArchived &&
            pot.isSome(message) &&
            isCreatedMessageWithContentAndDueDate(message.value)
          ) {
            accumulator.push(
              Tuple2(message.value, {
                isRead
              })
            );
          }

          return accumulator;
        }, [])
          // Sort by due_date
          .sort((messageAgendaItem1, messageAgendaItem2) =>
            compareAsc(
              messageAgendaItem1.e1.content.due_date,
              messageAgendaItem2.e1.content.due_date
            )
          )
          // Now we have an array of messages sorted by due_date.
          // To create groups (by due_date day) we can just iterate the array and
          // -  if the current message due_date day is different from the one of
          //    the prevMessage create a new section
          // -  if the current message due_date day is equal to the one of prevMessage
          //    add the message to the last section
          .reduce<{
            lastTitle: O.Option<string>;
            // eslint-disable-next-line
            sections: MessageAgendaSection[];
          }>(
            (accumulator, messageAgendaItem) => {
              // As title of the section we use the ISOString rapresentation
              // of the due_date day.
              const title = startOfDay(
                messageAgendaItem.e1.content.due_date
              ).toISOString();
              if (
                O.isNone(accumulator.lastTitle) ||
                title !== accumulator.lastTitle.value
              ) {
                // We need to create a new section
                const newSection = {
                  title,
                  data: [messageAgendaItem]
                };
                return {
                  lastTitle: O.some(title),
                  sections: [...accumulator.sections, newSection]
                };
              } else {
                // We need to add the message to the last section.
                // We are sure that pop will return at least one element because
                // of the previous `if` step.
                const prevSection =
                  accumulator.sections.pop() as MessageAgendaSection;
                const newSection = {
                  title,
                  data: [...prevSection.data, messageAgendaItem]
                };
                return {
                  lastTitle: O.some(title),
                  // We used pop so we need to re-add the section.
                  sections: [...accumulator.sections, newSection]
                };
              }
            },
            {
              lastTitle: O.none,
              sections: []
            }
          ).sections
    ),
    []
  );

/**
 * Return all the section with a date between the from and to time limit.
 */
const filterSectionsWithTimeLimit = (
  sections: Sections,
  fromTimeLimit: number,
  toTimeLimit: number
): Sections => {
  const filteredSections: Sections = [];

  for (const section of sections) {
    const decodedValue = DateFromISOString.decode(section.title);
    const sectionTime = E.isRight(decodedValue)
      ? decodedValue.right.getTime()
      : section.title;
    if (sectionTime > toTimeLimit) {
      break;
    }

    if (sectionTime >= fromTimeLimit && sectionTime <= toTimeLimit) {
      filteredSections.push(section);
    }
  }

  return filteredSections;
};

const selectFutureData = (sections: Sections): Sections => {
  const startOfTodayTime = startOfToday().getTime();

  const initialIndex = sections.findIndex(
    section => new Date(section.title).getTime() >= startOfTodayTime
  );

  return initialIndex < 0 ? [] : sections.slice(initialIndex);
};

const selectCurrentMonthRemainingData = (sections: Sections): Sections => {
  const startOfCurrentMonthTime = startOfMonth(new Date()).getTime();
  const endOfYesterdayTime = endOfYesterday().getTime();

  return filterSectionsWithTimeLimit(
    sections,
    startOfCurrentMonthTime,
    endOfYesterdayTime
  );
};

const selectPastMonthsData = (
  sections: Sections,
  howManyMonthsBack: number,
  initialStartOfMonthTime: number = startOfMonth(new Date()).getTime()
): Sections => {
  const newSections: Sections = [];

  new Array(howManyMonthsBack).fill(0).forEach((_, index) => {
    const selectedMonth = subMonths(
      initialStartOfMonthTime,
      howManyMonthsBack - index
    );

    const startOfSelectedMonthTime = startOfMonth(selectedMonth).getTime();
    const endOfSelectedMonthTime = endOfMonth(selectedMonth).getTime();

    const monthSections = filterSectionsWithTimeLimit(
      sections,
      startOfSelectedMonthTime,
      endOfSelectedMonthTime
    );

    // If we have no sections for this month create an ad-hoc empty section
    if (monthSections.length === 0) {
      const emptySection: MessageAgendaSection = {
        title: startOfSelectedMonthTime,
        data: [{ isPlaceholder: true }]
      };
      monthSections.push(emptySection);
    }

    newSections.push(...monthSections);
  });

  return newSections;
};

// return true if the last section is loaded
const isLastSectionLoaded = (
  lastDeadlineId: O.Option<string>,
  sections: Sections
): boolean =>
  pipe(
    lastDeadlineId,
    O.fold(
      () => false,
      lastId =>
        sections
          .map(s => s.data)
          .some(items =>
            items.some(
              item => !isPlaceholderItem(item) && item.e1.id === lastId
            )
          )
    )
  );

const selectInitialSectionsToRender = (
  sections: Sections,
  maybeLastLoadedStartOfMonthTime: O.Option<number>
): Sections => {
  const sectionsToRender: Sections = [];

  if (O.isSome(maybeLastLoadedStartOfMonthTime)) {
    // Select past months data
    const lastLoadedStartOfMonthTime = maybeLastLoadedStartOfMonthTime.value;
    const startOfCurrentMonthTime = startOfMonth(new Date()).getTime();
    const howManyMonthsBack = differenceInMonths(
      startOfCurrentMonthTime,
      lastLoadedStartOfMonthTime
    );
    sectionsToRender.push(...selectPastMonthsData(sections, howManyMonthsBack));

    // Select current month remaining data
    sectionsToRender.push(...selectCurrentMonthRemainingData(sections));
  }

  // Select future data (calendar events from today)
  sectionsToRender.push(...selectFutureData(sections));

  return sectionsToRender;
};

const selectMoreSectionsToRenderAsync = (
  sections: Sections,
  maybeLastLoadedStartOfMonthTime: O.Option<number>
): Sections => {
  const moreSectionsToRender: Sections = [];

  moreSectionsToRender.push(
    ...selectPastMonthsData(
      sections,
      PAST_DATA_MONTHS,
      O.toUndefined(maybeLastLoadedStartOfMonthTime)
    )
  );

  if (O.isNone(maybeLastLoadedStartOfMonthTime)) {
    moreSectionsToRender.push(...selectCurrentMonthRemainingData(sections));
  }
  return moreSectionsToRender;
};

/**
 * A component to show the messages with a due_date.
 */
class MessagesDeadlines extends React.PureComponent<Props, State> {
  private scrollToLocation: O.Option<SectionListScrollParams> = O.none;
  private messageAgendaRef = React.createRef<MessageAgenda>();

  /**
   * Used to maintain the same ScrollView position when loading
   * "previous" data.
   */
  private onContentSizeChange = () => {
    if (this.messageAgendaRef.current && O.isSome(this.scrollToLocation)) {
      // Scroll to the sectionIndex we was before the content size change.
      this.messageAgendaRef.current.scrollToLocation(
        this.scrollToLocation.value
      );
      // Reset the value to O.none.
      // eslint-disable-next-line
      this.scrollToLocation = O.none;
    }
  };

  private handleOnPressItem = (id: string) => {
    if (O.isSome(this.props.selectedItemIds)) {
      // Is the selection mode is active a simple "press" must act as
      // a "longPress" (select the item).
      this.handleOnLongPressItem(id);
    } else {
      this.props.navigateToMessageDetail(id);
    }
  };

  private handleOnLongPressItem = (id: string) => {
    this.props.toggleItemSelection(id);
  };

  private toggleAllMessagesSelection = () => {
    const { allMessageIdsState } = this.state;
    const { selectedItemIds } = this.props;
    if (O.isSome(selectedItemIds)) {
      this.props.setSelectedItemIds(
        O.some(
          allMessageIdsState.size === selectedItemIds.value.size
            ? new Set()
            : allMessageIdsState
        )
      );
    }
  };

  private archiveMessages = () => {
    this.props.resetSelection();
    this.props.setMessagesArchivedState(
      pipe(
        this.props.selectedItemIds,
        O.map(_ => Array.from(_)),
        O.getOrElseW(() => [])
      ),
      true
    );
  };

  private onLoadMoreDataRequest = (): void => {
    const { sections, maybeLastLoadedStartOfMonthTime } = this.state;

    this.setState({
      isWorking: true
    });
    const moreSectionsToRender = selectMoreSectionsToRenderAsync(
      sections,
      maybeLastLoadedStartOfMonthTime
    );
    this.setState((prevState: State) => {
      // Save the sectionIndex we want to scroll-to onContentSizeChange.
      if (prevState.sectionsToRender.length === 0) {
        // If not sections are redered we need to move to the bottom after rendering more sections
        const sectionIndex = moreSectionsToRender.length - 1;
        const itemIndex =
          moreSectionsToRender[moreSectionsToRender.length - 1].data.length - 1;
        // eslint-disable-next-line
        this.scrollToLocation = O.some({
          sectionIndex,
          itemIndex,
          viewOffset: 0,
          viewPosition: 1,
          animated: true
        });
      } else {
        // eslint-disable-next-line
        this.scrollToLocation = O.some({
          sectionIndex: moreSectionsToRender.length,
          itemIndex: -1,
          viewOffset: 0,
          viewPosition: 1,
          animated: true
        });
      }

      const lastLoadedStartOfMonthTime = pipe(
        maybeLastLoadedStartOfMonthTime,
        O.getOrElse(() => startOfMonth(new Date()).getTime())
      );

      return {
        isWorking: false,
        sectionsToRender: [
          ...moreSectionsToRender,
          ...prevState.sectionsToRender
        ],
        allMessageIdsState: new Set([
          ...this.generateMessagesIdsFromMessageAgendaSection(
            moreSectionsToRender
          ),
          ...prevState.allMessageIdsState
        ]),
        maybeLastLoadedStartOfMonthTime: O.some(
          startOfMonth(
            subMonths(lastLoadedStartOfMonthTime, PAST_DATA_MONTHS)
          ).getTime()
        ),
        isContinuosScrollEnabled: !isLastSectionLoaded(
          this.state.lastDeadlineId,
          [...moreSectionsToRender, ...prevState.sectionsToRender]
        )
      };
    });
  };

  constructor(props: Props) {
    super(props);
    this.state = {
      isWorking: true,
      sections: [],
      sectionsToRender: [],
      maybeLastLoadedStartOfMonthTime: O.none,
      allMessageIdsState: new Set(),
      isContinuosScrollEnabled: true,
      lastDeadlineId: O.none,
      nextDeadlineId: O.none
    };
  }

  public componentDidMount() {
    const { messagesState } = this.props;
    const { maybeLastLoadedStartOfMonthTime } = this.state;

    const sections = generateSections(messagesState);
    const lastDeadlineId = getLastDeadlineId(sections);
    const nextDeadlineId = getNextDeadlineId(sections);

    const sectionsToRender = selectInitialSectionsToRender(
      sections,
      maybeLastLoadedStartOfMonthTime
    );

    // If there are older deadlines the scroll must be enabled to allow data loading when requested
    const isContinuosScrollEnabled = !isLastSectionLoaded(
      lastDeadlineId,
      sectionsToRender
    );

    this.setState({
      isWorking: false,
      sections,
      sectionsToRender,
      allMessageIdsState:
        this.generateMessagesIdsFromMessageAgendaSection(sectionsToRender),
      isContinuosScrollEnabled,
      lastDeadlineId,
      nextDeadlineId
    });
  }

  public componentDidUpdate(prevProps: Props, prevState: State) {
    const { messagesState } = this.props;
    const { messagesState: prevMessagesState } = prevProps;
    const { maybeLastLoadedStartOfMonthTime, isWorking, sectionsToRender } =
      this.state;

    if (prevProps.currentTab !== this.props.currentTab) {
      this.props.resetSelection();
    }

    if (messagesState !== prevMessagesState) {
      this.setState({
        isWorking: true
      });

      const sections = generateSections(messagesState);
      const lastDeadlineId = getLastDeadlineId(sections);
      const nextDeadlineId = getNextDeadlineId(sections);

      const sectionsToRender = selectInitialSectionsToRender(
        sections,
        maybeLastLoadedStartOfMonthTime
      );
      // If there are older deadlines the scroll must be enabled to allow data loading when requested
      const isContinuosScrollEnabled = !isLastSectionLoaded(
        lastDeadlineId,
        sectionsToRender
      );

      this.setState({
        isWorking: false,
        sections,
        sectionsToRender,
        allMessageIdsState:
          this.generateMessagesIdsFromMessageAgendaSection(sectionsToRender),
        isContinuosScrollEnabled,
        lastDeadlineId,
        nextDeadlineId
      });
    }

    /**
     * If this screen switched to `isWorking = false` from a
     * `isWorking = true` state, but the rendered sections didn't
     * actually change, then we can disable the `isContinuosScrollEnabled`
     * in order to remove the loader in deadlock.
     *
     * FIXME: This fix won't address the real problem in this section, which is
     * in the function `onLoadMoreDataRequest` and in the fact that the `isWorking`
     * state is not really switching from `true` to `false` due probably to
     * an internal React debouncing. **This workaround needs to be removed if
     * the real issue has to be fixed**.
     */

    const hasFinishedWorking = prevState.isWorking && !isWorking;
    const haveSectionsChanged =
      sectionsToRender.length > prevState.sectionsToRender.length;

    if (hasFinishedWorking && haveSectionsChanged) {
      this.setState({
        isContinuosScrollEnabled: false
      });
    }
  }

  private generateMessagesIdsFromMessageAgendaSection(
    sections: Sections
  ): Set<string> {
    // eslint-disable-next-line
    const messagesIds: string[] = [];
    sections.forEach(messageAgendaSection =>
      messageAgendaSection.data.forEach(item => {
        const idMessage = !isPlaceholderItem(item) ? item.e1.id : undefined;
        if (idMessage !== undefined) {
          messagesIds.push(idMessage);
        }
      })
    );
    return messagesIds.length > 0 ? new Set(messagesIds) : new Set();
  }

  public render() {
    const {
      messagesState,
      servicesById,
      paymentsByRptId,
      selectedItemIds,
      resetSelection
    } = this.props;
    const {
      allMessageIdsState,
      isWorking,
      sectionsToRender,
      isContinuosScrollEnabled,
      lastDeadlineId,
      nextDeadlineId
    } = this.state;

    const isRefreshing = pot.isLoading(messagesState) || isWorking;

    return (
      <View style={styles.listWrapper}>
        <View style={styles.listContainer}>
          <MessageAgenda
            ref={this.messageAgendaRef}
            sections={sectionsToRender}
            servicesById={servicesById}
            paymentsByRptId={paymentsByRptId}
            refreshing={isRefreshing}
            selectedMessageIds={selectedItemIds}
            onPressItem={this.handleOnPressItem}
            onLongPressItem={this.handleOnLongPressItem}
            onMoreDataRequest={this.onLoadMoreDataRequest}
            onContentSizeChange={this.onContentSizeChange}
            isContinuosScrollEnabled={isContinuosScrollEnabled}
            lastDeadlineId={lastDeadlineId}
            nextDeadlineId={nextDeadlineId}
          />
        </View>
        {O.isSome(selectedItemIds) && (
          <ListSelectionBar
            selectedItems={pipe(
              selectedItemIds,
              O.map(_ => _.size),
              O.getOrElse(() => 0)
            )}
            totalItems={allMessageIdsState.size}
            onToggleSelection={this.archiveMessages}
            onToggleAllSelection={this.toggleAllMessagesSelection}
            onResetSelection={resetSelection}
            primaryButtonText={I18n.t("messages.cta.archive")}
          />
        )}
      </View>
    );
  }
}

export default withItemsSelection(MessagesDeadlines);
