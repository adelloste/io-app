import * as E from "fp-ts/lib/Either";
import { ThirdPartyMessageWithContent } from "../../../../../definitions/backend/ThirdPartyMessageWithContent";
import { apiUrlPrefix } from "../../../../config";
import { UIMessageId } from "../../../../store/reducers/entities/messages/types";
import { ContentTypeValues } from "../../../../types/contentType";
import { MvlAttachmentId } from "../../../mvl/types/mvlData";
import { PNMessage, FullReceivedNotification } from "./types";

const generateAttachmentUrl = (messageId: string, attachmentUrl: string) =>
  `${apiUrlPrefix}/api/v1/third-party-messages/${messageId}/attachments/${attachmentUrl.replace(
    /^\//g, // note that attachmentUrl might contains a / at the beginning, so let's strip it
    ""
  )}`;

export const toPNMessage = (
  messageFromApi: ThirdPartyMessageWithContent
): PNMessage | undefined => {
  const maybeNotification = FullReceivedNotification.decode(
    messageFromApi.third_party_message.details
  );

  if (E.isRight(maybeNotification)) {
    return {
      ...maybeNotification.right,
      serviceId: messageFromApi.sender_service_id,
      attachments: messageFromApi.third_party_message.attachments?.map(_ => ({
        messageId: messageFromApi.id as UIMessageId,
        id: _.id as string as MvlAttachmentId,
        displayName: _.name ?? _.id,
        contentType: _.content_type ?? ContentTypeValues.applicationOctetStream,
        resourceUrl: { href: generateAttachmentUrl(messageFromApi.id, _.url) }
      }))
    };
  }
  return undefined;
};
