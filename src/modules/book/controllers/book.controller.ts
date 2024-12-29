import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { BooksRepository } from "../repositories/book.repository";
import {
  addBookStageReqI,
  addManuscriptActivityI,
  bookIdStageParamsI,
  createBookI,
  filterBookI,
  updateBookStageI,
  updateManuscriptStatusI,
} from "../interfaces/book.interface";
import { UserService } from "src/modules/user/services/user.service";
import { BOOK_STAGE_TREE } from "../constants/stage";
import { DbExecptions } from "src/common/constants/status";
import { CommonExceptions } from "src/common/constants/status";
import { BooksService } from "../services/books.service";
import { userRoleInitCount } from "src/modules/user/constants/roles";
import { UsersRepository } from "src/modules/user/repositories/user.repository";
import { BookUserMapIncludeGuard } from "../guards/bookUserMapInc.guard";
import { UserResourceIncludeGuard } from "src/modules/user/gaurds/userInc.guard";

@Controller("books")
export class BookController {
  constructor(
    private readonly booksRepo: BooksRepository,
    private readonly usersService: UserService,
    private readonly booksService: BooksService,
    private readonly usersRepo: UsersRepository
  ) {}
  @Post()
  async add(@Body() body: createBookI, @Req() req: Request) {
    const { userDetails } = req["context"];
    const bookUsersMap = new Map(Object.entries(userRoleInitCount));
    for (const buId of body.bookUsers) {
      const ud = await this.usersRepo.getUserById({ id: buId });
      bookUsersMap.set(ud.Role.role, 1);
    }
    Object.keys(bookUsersMap).forEach((k) => {
      if (bookUsersMap[k] === 0) throw CommonExceptions.MISSING_FIELD(k);
    });
    const bk = await this.booksService.createBookWithInitStages({
      ...body,
      createdBy: userDetails.id,
    });
    return bk;
  }

  // filtering based on role required
  @Post("/list")
  @UseGuards(UserResourceIncludeGuard)
  async list(@Body() body: filterBookI, @Req() req: Request) {
    const { internalAccessPayload } = body;
    console.log(internalAccessPayload, "ddkdkdkd");
    if (body.stage) {
      const stgd = BOOK_STAGE_TREE.find((bk) => bk.stage === body.stage);
      body.stageId = stgd.id;
    }
    const [list, count] = await Promise.all([
      this.booksService.getFilteredBooks({
        ...body,
        ...internalAccessPayload,
      }),
      this.booksService.getFilteredBooksCount({
        ...body,
        ...internalAccessPayload,
      }),
    ]);
    const listRes = await Promise.all(
      list.map(async (ls) => {
        const obj = { ...ls };
        const ud = obj["BookUserMap"];
        const [stgs, ump] = await Promise.all([
          await Promise.all(
            obj["BookStage"].map(async (bkstg) => {
              bkstg.stage = BOOK_STAGE_TREE.find(
                (v) => v.id === bkstg.stageId
              ).stage;
              return bkstg;
            })
          ),
          Promise.all(
            ud.map(async (u) =>
              this.usersService.prepareUser({ user: u["User"] })
            )
          ),
        ]);
        obj["BookUserMap"] = ump;
        obj["BookStage"] = stgs;
        return obj;
      })
    );
    return {
      count,
      list: listRes,
    };
  }

  @Get("/:id")
  // @UseGuards(BookUserMapIncludeGuard)
  async getBookById(
    @Param() params: { id: string },
    @Query() query: { stage: string }
  ) {
    return await this.booksService.getBookWithDraftImage(
      await this.booksRepo.getBookById({
        id: params.id,
        stageId: query.stage
          ? BOOK_STAGE_TREE.find((bk) => bk.stage === query.stage).id
          : undefined,
      })
    );
  }
  // changes for bk stage to book id and stage name
  @Post("/:id/stage")
  async addBookStage(@Param("id") id: string, @Body() body: addBookStageReqI) {
    const bkStgs = await this.booksRepo.getBookStages({ bookId: id });
    const stgD = BOOK_STAGE_TREE.find((st) => st.stage === body.stage);
    if (stgD.prevId !== null) {
      stgD.prevId.forEach((st) => {
        const bkStage = bkStgs.find((bkStg) => bkStg.stageId === st);
        if (!bkStage) throw CommonExceptions.INVALID_BOOK_STAGE_REDIRECTION;
      });
    }
    return this.booksRepo.addBookStageDetails({ ...body, stageId: stgD.id });
  }
  @Put("/:id/stage/:stage")
  // @UseGuards(BookUserMapIncludeGuard)
  async updateBookStage(
    @Param()
    params: bookIdStageParamsI,
    @Body() body: updateBookStageI
  ) {
    const stg = BOOK_STAGE_TREE.find((v) => v.stage === params.stage);
    if (!stg) {
      throw DbExecptions.DOESNOT_EXISTS("Stage");
    }
    await this.booksRepo.updateBookStage({
      ...body,
      stageId: stg.id,
      bookId: params.id,
    });
  }
  @Get("/stage/:id")
  // @UseGuards(BookUserMapIncludeGuard)
  async getBookStageDetails(@Param() params: { id: string }) {
    return await this.booksRepo.getBookStageById({ id: params.id });
  }
  @Get("/:id/stage/all")
  getBookStages(@Param() params: { id: string }) {
    return this.booksRepo.getBookStages({ bookId: params.id });
  }
  @Get("/manuscript/:mid/activity")
  getManuscriptActivities(@Param("mid") mid: string) {
    return this.booksRepo.getManuscriptActivityById({ mid });
  }
  @Post("/manuscript/activity")
  addManuscriptActivity(@Body() body: addManuscriptActivityI) {
    return this.booksRepo.addManuscriptActivity(body);
  }
  @Put("/manuscript/:mid")
  async updateBookStageManuscriptStatus(
    @Param("mid") mid: string,
    @Body() body: updateManuscriptStatusI,
    @Req() req: Request
  ) {
    const { userDetails } = req["context"];
    const [res, manu] = await Promise.all([
      await this.booksRepo.updateManuscriptStatus({
        id: mid,
        ...body,
      }),
      ,
      await this.booksRepo.getBookByManuscriptId({
        mid,
      }),
    ]);
    const content = this.booksService.getActivityContent({
      ...body,
      stageId: manu.BookStage.id,
    });
    await this.booksRepo.addManuscriptActivity({
      bkStgManuId: mid,
      content,
      type: 0,
      createdBy: userDetails.id,
    });
    return res;
  }
}
