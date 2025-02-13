import * as pot from "@pagopa/ts-commons/lib/pot";
import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import { View } from "native-base";
import React, { ComponentProps } from "react";
import { StyleSheet } from "react-native";

import {
  lexicallyOrderedMessagesStateSelector,
  MessagesStateAndStatus
} from "../../store/reducers/entities/messages";
import { ServicesByIdState } from "../../store/reducers/entities/services/servicesById";
import { messageContainsText } from "../../utils/messages";
import { serviceContainsText } from "../../utils/services";
import { SearchNoResultMessage } from "../search/SearchNoResultMessage";
import MessageList from "./MessageList";

const styles = StyleSheet.create({
  listWrapper: {
    flex: 1
  }
});

type OwnProps = {
  messagesState: ReturnType<typeof lexicallyOrderedMessagesStateSelector>;
  searchText: string;
  navigateToMessageDetail: (id: string) => void;
};

type Props = Pick<
  ComponentProps<typeof MessageList>,
  "servicesById" | "paymentsByRptId" | "onRefresh"
> &
  OwnProps;

type State = {
  potFilteredMessageStates: pot.Pot<
    ReadonlyArray<MessagesStateAndStatus>,
    Error
  >;
};

/**
 * Filter only the messages that match the searchText.
 * The searchText is checked both in message and in service properties.
 */
const generateMessagesStateMatchingSearchTextArrayAsync = (
  potMessagesState: pot.Pot<ReadonlyArray<MessagesStateAndStatus>, string>,
  servicesById: ServicesByIdState,
  searchText: string
): Promise<ReadonlyArray<MessagesStateAndStatus>> =>
  new Promise(resolve => {
    const result = pot.getOrElse(
      pot.map(potMessagesState, _ =>
        _.filter(messageState =>
          pot.getOrElse(
            pot.map(
              messageState.message,
              message =>
                // Search in message properties
                messageContainsText(message, searchText) ||
                pipe(
                  servicesById[message.sender_service_id],
                  O.fromNullable,
                  O.map(potService =>
                    pot.getOrElse(
                      pot.map(potService, service =>
                        // Search in service properties
                        serviceContainsText(service, searchText)
                      ),
                      false
                    )
                  ),
                  O.getOrElse(() => false)
                )
            ),
            false
          )
        )
      ),
      []
    );

    resolve(result);
  });

/**
 * A component to render a list of messages that match a searchText.
 */
class MessagesSearch extends React.PureComponent<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      potFilteredMessageStates: pot.none
    };
  }

  public async componentDidMount() {
    const { messagesState, servicesById, searchText } = this.props;
    const { potFilteredMessageStates } = this.state;

    // Set filtering status
    this.setState({
      potFilteredMessageStates: pot.toLoading(potFilteredMessageStates)
    });

    // Start filtering messages
    const filteredMessageStates =
      await generateMessagesStateMatchingSearchTextArrayAsync(
        messagesState,
        servicesById,
        searchText
      );

    // Unset filtering status
    this.setState({
      potFilteredMessageStates: pot.some(filteredMessageStates)
    });
  }

  public async componentDidUpdate(prevProps: Props) {
    const { messagesState: prevMessagesState, searchText: prevSearchText } =
      prevProps;
    const { messagesState, servicesById, searchText } = this.props;
    const { potFilteredMessageStates } = this.state;

    if (messagesState !== prevMessagesState || searchText !== prevSearchText) {
      // Set filtering status
      this.setState({
        potFilteredMessageStates: pot.toLoading(potFilteredMessageStates)
      });

      // Start filtering messages
      const filteredMessageStates =
        await generateMessagesStateMatchingSearchTextArrayAsync(
          messagesState,
          servicesById,
          searchText
        );

      // Unset filtering status
      this.setState({
        potFilteredMessageStates: pot.some(filteredMessageStates)
      });
    }
  }

  public render() {
    const { potFilteredMessageStates } = this.state;

    const isLoading = pot.isLoading(this.props.messagesState);
    const isFiltering = pot.isLoading(potFilteredMessageStates);

    const filteredMessageStates = pot.getOrElse(potFilteredMessageStates, []);

    return filteredMessageStates.length > 0 ? (
      <View style={styles.listWrapper}>
        <MessageList
          {...this.props}
          messageStates={filteredMessageStates}
          onPressItem={this.handleOnPressItem}
          onLongPressItem={this.handleOnPressItem}
          refreshing={isLoading || isFiltering}
          selectedMessageIds={O.none}
        />
      </View>
    ) : (
      <SearchNoResultMessage errorType="NoResultsFound" />
    );
  }

  private handleOnPressItem = (id: string) => {
    this.props.navigateToMessageDetail(id);
  };
}

export default MessagesSearch;
