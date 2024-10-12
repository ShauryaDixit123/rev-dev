import { uploadImageI } from "src/modules/book/interfaces/book.interface";
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ProjectPaths } from "src/common/constants/paths";
import { ImageFormats } from "../constants/formats";
import { DynamicStatusCodes } from "src/common/constants/status";
import { DraftService } from "../services/draft.service";
import { DraftRepository } from "../repositories/draft.repository";
import { BookUserMapIncludeGuard } from "../guards/bookUserMapInc.guard";
import { ImageFormatInitNames } from "../constants/initNames";
import {
  addPageContentBodyI,
  addPageContentParamsI,
} from "../interfaces/draft.interface";

@Controller("books/draft")
export class DraftController {
  constructor(
    private readonly draftService: DraftService,
    private readonly draftRepo: DraftRepository
  ) {}
  @Post("/presigned")
  async uploadBookDraft(
    @Body()
    body: uploadImageI,
    @Req()
    req: Request
  ) {
    const uploadedBy = req["context"]["userDetails"]?.id;
    const { title, mimeType } = body;
    if (!ImageFormats.DRAFT_ACCEPTED_FORMATS.includes(mimeType))
      throw DynamicStatusCodes.INVAID_DOCUMENT_FORMAT(
        ImageFormats.DRAFT_ACCEPTED_FORMATS.join(",")
      );
    const s3Path: string = `${
      ProjectPaths.S3_BOOK_DRAFT
    }/${title}${new Date().valueOf()}`;
    if (body.id) {
      return this.draftService.fetchPresignedForDraft({ bookId: body.id });
    }
    const { signedURL, doc } = await this.draftService.addBookDraftImage({
      ...body,
      s3Path,
      uploadedBy,
    });
    return { signedURL, id: doc.id };
  }
  @UseGuards(BookUserMapIncludeGuard)
  @Post("/prepare")
  async prepareDraft(
    @Body()
    body: {
      bookId: string;
      stage: string;
      parentId?: string;
    }
  ) {
    const stgD = this.draftService.getBookStageId({ stage: body.stage });
    if (stgD.prevId != null) {
      const bkD = await this.draftRepo.getFinalManuscriptForStage({
        bookId: body.bookId,
        stageId: stgD.id,
      });
      body.parentId = bkD.BookStageManuscript[0]?.id;
    }
    return await this.draftService.prepareDraft({
      bookId: body.bookId,
      stageId: stgD.id,
      parentBkManuId: body.parentId,
    });
  }
  @UseGuards(BookUserMapIncludeGuard)
  @Put("/manuscript/:mid")
  async updateManuscript(
    @Param()
    params: addPageContentParamsI,
    @Body()
    body: addPageContentBodyI
  ) {
    let ms = await this.draftRepo.getBookStageManucriptById({
      id: params.mid,
    });
    if (ms.isSubmitted) {
      const bkMans = this.draftRepo.getBookManuscriptsBkStgId({
        bkStgId: ms.BookStage.id,
      });
      const newMs = await this.draftRepo.addBookManuscript({
        bkStgId: ms.BookStage.id,
        parentId: ms.id,
        name: `${ImageFormatInitNames.REVISED_MANUSCRIPT_NAME} ${
          (
            await bkMans
          ).length
        }`,
        isSubmitted: body.imageId ? true : false,
        imageId: body.imageId,
      });
      ms = await this.draftRepo.getBookStageManucriptById({ id: newMs.id });
    }
    if (body.imageId) {
      return { manuscript: ms };
    }
    const pg = await this.draftRepo.getManuscriptPage({
      bkStgManuId: ms.id,
      page: body.page,
    });
    if (pg) {
      await this.draftRepo.deleteBookManuscriptPage({
        bkManuId: ms.id,
        page: Number(body.page),
      });
    }
    const pgN = await this.draftRepo.addBookStageManuscriptPage({
      page: Number(body.page),
      content: body.content,
      bkStgManuId: ms.id,
    });
    return { page: pgN, manuscript: ms };
  }
  @UseGuards(BookUserMapIncludeGuard)
  @Get("/manuscript/:mid/:page")
  async getManuscriptById(@Param() params: { mid: string; page: number }) {
    let pg = await this.draftRepo.getManuscriptPage({
      bkStgManuId: params.mid,
      page: Number(params.page),
    });
    if (!pg) {
      pg = await this.draftService.getRecursPageManuscript(params);
    }
    return pg;
  }
}
